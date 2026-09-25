import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, Check, CheckCircle2, FileUp, Lock, ShieldCheck, X } from 'lucide-react'
import { useData } from '../../ctx/DataContext.jsx'
import { Badge, Btn, Card, Field, Input, Select, cx } from '../../components/ui.jsx'
import { casToHoldingRows } from '../../lib/cas/parser.js'
import { readCasPdf, PasswordNeeded } from '../../lib/cas/pdf.js'
import { FUND_CATEGORIES, assetLabel } from '../../lib/constants.js'
import { inr, units as fmtUnits } from '../../lib/format.js'
import { dateLabel, nextOccurrenceAfter } from '../../lib/dates.js'

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

/** Which existing holding does a statement row correspond to? */
function matchExisting(row, holdings) {
  const strict = holdings.find((h) => h.isin === row.isin && (row.source === 'mf' ? h.folio_no === row.folio_no : h.dp_name === row.dp_name && h.dp_ref === row.dp_ref))
  if (strict) return strict
  const loose = holdings.filter((h) => h.isin === row.isin && !h.folio_no && !h.dp_ref)
  if (loose.length === 1) return loose[0]
  const byName = holdings.filter((h) => !h.isin && norm(h.name) === norm(row.name))
  return byName.length === 1 ? byName[0] : null
}

export default function Cas() {
  const { data, addMany, edit, add, me, owners, notify, today } = useData()
  const [step, setStep] = useState('idle') // idle | reading | password | review | importing | done
  const [file, setFile] = useState(null)
  const [pw, setPw] = useState('')
  const [wrongPw, setWrongPw] = useState(false)
  const [error, setError] = useState(null)
  const [parsed, setParsed] = useState(null)
  const [rows, setRows] = useState([])
  const [cands, setCands] = useState([])
  const [closing, setClosing] = useState({})
  const [result, setResult] = useState(null)
  const input = useRef(null)

  const reset = () => { setStep('idle'); setFile(null); setPw(''); setError(null); setParsed(null); setRows([]); setCands([]); setResult(null); setWrongPw(false); if (input.current) input.current.value = '' }

  const read = async (f, password) => {
    setStep('reading'); setError(null)
    try {
      const p = await readCasPdf(f, password)
      if (!p.ok) { setError(p.warnings[0] || 'No holdings found in this PDF.'); setStep('idle'); return }
      const base = casToHoldingRows(p).map((r) => {
        const match = matchExisting(r, data.holdings)
        return { ...r, match, include: Number(r.value) > 0 || Number(r.units) > 0, person: r.joint_with ? 'Joint' : me || owners[0], category: r.category || '' }
      })
      const known = new Set(data.sip_master.map((s) => s.isin).filter(Boolean))
      const byHolding = new Set(data.sip_master.map((s) => s.holding_id).filter(Boolean))
      setParsed(p); setRows(base)
      setCands(p.sipCandidates.map((c) => {
        const h = base.find((r) => r.isin === c.isin)
        const exists = known.has(c.isin) || (h?.match && byHolding.has(h.match.id))
        return { ...c, include: !exists && !!h, exists, goal_id: '' }
      }))
      setStep('review')
    } catch (e) {
      if (e instanceof PasswordNeeded) { setWrongPw(e.wrong); setStep('password'); return }
      setError(`Could not read this PDF (${e.message || e}). Make sure it is the CAS PDF from CDSL / NSDL / CAMS / KFintech.`); setStep('idle')
    }
  }

  const pick = (e) => { const f = e.target.files?.[0]; if (!f) return; setFile(f); setPw(''); read(f) }
  const onDrop = (e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) { setFile(f); setPw(''); read(f) } }
  const setRow = (key, patch) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)))

  const importedKeys = useMemo(() => new Set(rows.map((r) => r.match?.id).filter(Boolean)), [rows])
  const missing = useMemo(() => data.holdings.filter((h) => h.source === 'cas' && h.active !== false && !importedKeys.has(h.id)), [data.holdings, importedKeys])
  const sel = rows.filter((r) => r.include)

  const doImport = async () => {
    setStep('importing')
    try {
      const stmt = parsed.statementDate || today
      const mk = (r) => ({
        name: r.name, asset_type: r.asset_type, category: r.category || null, person: r.person, isin: r.isin, folio_no: r.folio_no || null, dp_name: r.dp_name || null, dp_ref: r.dp_ref || null,
        units: r.units, price: r.price, price_date: stmt, baseline_date: stmt, current_value: null, source: 'cas', active: true,
      })
      const fresh = sel.filter((r) => !r.match)
      const upd = sel.filter((r) => r.match)
      const holdingByIsin = {}
      let created = []
      if (fresh.length) created = await addMany('holdings', fresh.map((r) => ({ ...mk(r), invested_amount: r.invested ?? 0, cost_known: r.cost_known !== false })))
      created.forEach((h) => { holdingByIsin[h.isin] = holdingByIsin[h.isin] || h })
      for (const r of upd) {
        const keepCost = r.source === 'demat' && r.match.cost_known !== false
        const patch = { ...mk(r), goal_id: r.match.goal_id, ...(r.source === 'mf' ? { invested_amount: r.invested ?? 0, cost_known: true } : keepCost ? {} : { invested_amount: r.match.invested_amount, cost_known: r.match.cost_known }) }
        // keep manual names/categories the user already curated
        patch.name = r.match.name || patch.name
        patch.category = r.match.category || patch.category
        const saved = await edit('holdings', r.match.id, patch)
        holdingByIsin[r.isin] = holdingByIsin[r.isin] || saved
      }
      let sipsMade = 0
      for (const c of cands.filter((x) => x.include)) {
        const h = holdingByIsin[c.isin]
        if (!h) continue
        await add('sip_master', {
          fund_name: h.name || c.name, category: h.category || null, amount: c.amount, sip_day: c.sip_day, start_date: nextOccurrenceAfter(c.sip_day, stmt), person: h.person,
          holding_id: h.id, isin: c.isin, goal_id: c.goal_id || null, active: true, notes: 'Detected from CAS transactions',
        })
        sipsMade++
      }
      const closeIds = Object.keys(closing).filter((k) => closing[k])
      for (const id of closeIds) await edit('holdings', id, { active: false })
      setResult({ added: fresh.length, updated: upd.length, sips: sipsMade, closed: closeIds.length })
      setStep('done')
      notify('CAS imported')
    } catch (e) { setError(e.message); setStep('review') }
  }

  const mfTotal = parsed?.mfHoldings.reduce((s, h) => s + h.value, 0) || 0
  const dmTotal = parsed?.demat.reduce((s, h) => s + h.value, 0) || 0

  return (
    <div className="space-y-5">
      <Card>
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 shrink-0 text-sage" size={20} />
          <div className="text-[13.5px] text-soft">
            <p className="text-ink"><b>Upload the CAS PDF</b> you get from CDSL, NSDL, CAMS or KFintech (the e-mailed monthly / on-request statement).</p>
            <p className="mt-1">The PDF is read <b>inside your browser</b> - it is never uploaded. PAN, phone, e-mail, address and nominee details are ignored; only fund/share names, ISINs, folio numbers, units, values and the last 4 digits of the demat id are used.</p>
          </div>
        </div>
      </Card>

      {(step === 'idle' || step === 'reading') && (
        <div onDragOver={(e) => e.preventDefault()} onDrop={onDrop}
          className="flex flex-col items-center rounded-xl border-2 border-dashed border-line-strong bg-surface px-4 py-12 text-center">
          <FileUp size={30} className="text-gold" />
          <p className="mt-3 text-[15px] font-medium">{step === 'reading' ? 'Reading the statement…' : 'Drop your CAS PDF here'}</p>
          <p className="mt-1 text-[13px] text-soft">{step === 'reading' ? file?.name : 'or choose the file from your device'}</p>
          <input ref={input} id="cas-file" type="file" accept="application/pdf,.pdf" className="sr-only" onChange={pick} disabled={step === 'reading'} />
          <label htmlFor="cas-file" className={cx('btn btn-primary mt-4', step === 'reading' && 'pointer-events-none opacity-50')}>Choose PDF</label>
          {error && <p className="mt-4 max-w-md rounded-lg bg-rust-soft px-3 py-2 text-[13px] text-rust">{error}</p>}
        </div>
      )}

      {step === 'password' && (
        <Card>
          <form className="mx-auto max-w-sm space-y-3" onSubmit={(e) => { e.preventDefault(); read(file, pw) }}>
            <Lock className="text-gold" size={22} />
            <h2 className="font-display text-[19px] font-semibold">This PDF is password-protected</h2>
            <p className="text-[13px] text-soft">CAS files are usually locked with the PAN in capital letters (or the password you set when requesting it). It is used only to open the file here and is not saved.</p>
            <Field label="Password" error={wrongPw ? 'That password did not work - try again' : null}><Input type="password" autoFocus autoComplete="off" value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
            <div className="flex gap-2"><Btn variant="primary" type="submit" disabled={!pw}>Unlock</Btn><Btn type="button" onClick={reset}>Cancel</Btn></div>
          </form>
        </Card>
      )}

      {(step === 'review' || step === 'importing') && parsed && (
        <>
          <Card title={`Statement as on ${dateLabel(parsed.statementDate)}${parsed.depository ? ` · ${parsed.depository}` : ''}`}>
            <div className="grid gap-4 sm:grid-cols-3">
              <div><div className="text-[11px] font-semibold uppercase tracking-wider text-muted">Mutual funds</div><div className="mt-1 text-[20px] font-semibold tnum">{inr(mfTotal)}</div><div className="text-[12px] text-soft">{parsed.mfHoldings.length} folios</div></div>
              <div><div className="text-[11px] font-semibold uppercase tracking-wider text-muted">Demat (shares / ETFs)</div><div className="mt-1 text-[20px] font-semibold tnum">{inr(dmTotal)}</div><div className="text-[12px] text-soft">{parsed.demat.length} holdings</div></div>
              <div><div className="text-[11px] font-semibold uppercase tracking-wider text-muted">SIPs detected</div><div className="mt-1 text-[20px] font-semibold tnum">{parsed.sipCandidates.length}</div><div className="text-[12px] text-soft">from the transactions</div></div>
            </div>
            {parsed.checks.length > 0 && (
              <ul className="mt-4 space-y-1.5 border-t border-line pt-3.5">
                {parsed.checks.map((c, i) => (
                  <li key={i} className="flex items-center gap-2 text-[13px]">
                    {c.ok ? <CheckCircle2 size={16} className="shrink-0 text-sage" /> : <AlertTriangle size={16} className="shrink-0 text-rust" />}
                    <span className={c.ok ? 'text-soft' : 'text-rust'}>{c.label}: {c.ok ? `matches the statement total (${inr(c.expected)})` : `statement says ${inr(c.expected)} but ${inr(c.actual)} was read - please review below`}</span>
                  </li>
                ))}
              </ul>
            )}
            {parsed.warnings.length > 0 && <ul className="mt-3 space-y-1 text-[12.5px] text-gold">{parsed.warnings.map((w, i) => <li key={i}>• {w}</li>)}</ul>}
          </Card>

          <Card title="Holdings to import" pad={false}>
            <div className="scroll-x p-2 md:p-3">
              <table className="w-full min-w-[760px] text-[13px]">
                <thead><tr><th className="th w-8" /><th className="th">Holding</th><th className="th text-right">Units</th><th className="th text-right">Value</th><th className="th">Holder</th><th className="th">Category</th><th className="th">What happens</th></tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.key} className={r.include ? '' : 'opacity-50'}>
                      <td className="td"><input type="checkbox" checked={r.include} onChange={(e) => setRow(r.key, { include: e.target.checked })} className="h-4 w-4 accent-[var(--gold-fill)]" aria-label={`Import ${r.name}`} /></td>
                      <td className="td min-w-[220px]"><div className="font-medium leading-snug">{r.name}</div><div className="text-[11.5px] text-muted">{assetLabel(r.asset_type)} · {r.isin}{r.folio_no ? ` · folio ${r.folio_no}` : r.dp_name ? ` · ${r.dp_name} ••${r.dp_ref}` : ''}</div></td>
                      <td className="td tnum text-right">{fmtUnits(r.units)}</td>
                      <td className="td tnum text-right font-medium">{inr(r.value)}</td>
                      <td className="td"><select className="field-input !min-h-[32px] !min-w-[104px] !py-1 !text-[12.5px]" value={r.person} onChange={(e) => setRow(r.key, { person: e.target.value })} aria-label={`Holder of ${r.name}`}>{owners.map((o) => <option key={o}>{o}</option>)}</select></td>
                      <td className="td">{r.asset_type === 'equity' ? <span className="text-muted">—</span> : <select className="field-input !min-h-[32px] !min-w-[150px] !py-1 !text-[12.5px]" value={r.match?.category || r.category} onChange={(e) => setRow(r.key, { category: e.target.value })} disabled={!!r.match?.category} aria-label={`Category of ${r.name}`}><option value="">—</option>{FUND_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>}</td>
                      <td className="td">{r.match ? <Badge tone="gold">Update existing</Badge> : <Badge tone="sage">New</Badge>}{r.source === 'demat' && <div className="mt-1 text-[11px] text-muted">{r.match ? 'cost kept as you had it' : 'no cost in statement'}</div>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {rows.some((r) => !r.include && !(Number(r.value) > 0)) && <p className="px-5 pb-2 text-[12px] text-muted">{rows.filter((r) => !(Number(r.value) > 0)).length} folios with a zero balance (fully redeemed) are unticked - tick one if you still want it listed.</p>}
            <p className="px-5 pb-4 text-[12px] text-muted">Importing sets each holding&apos;s units and price as of the statement date. SIP instalments after that date are added on top, so nothing is counted twice.</p>
          </Card>

          {cands.length > 0 && (
            <Card title="SIPs found in your transactions">
              <p className="mb-3 text-[13px] text-soft">These look like monthly SIPs. Add them to the SIP master so future instalments post automatically.</p>
              <ul className="divide-y divide-line">
                {cands.map((c) => (
                  <li key={c.isin} className="flex flex-wrap items-center gap-3 py-2.5">
                    <input type="checkbox" checked={c.include} disabled={c.exists} onChange={(e) => setCands((cs) => cs.map((x) => (x.isin === c.isin ? { ...x, include: e.target.checked } : x)))} className="h-4 w-4 accent-[var(--gold-fill)]" aria-label={`Create SIP for ${c.name}`} />
                    <div className="min-w-[200px] flex-1"><div className="text-[13.5px] font-medium">{c.name}</div><div className="text-[12px] text-muted">{inr(c.amount)} on day {c.sip_day} · last seen {dateLabel(c.last_date)}</div></div>
                    {c.exists ? <Badge>already in SIP master</Badge> : (
                      <select className="field-input !min-h-[32px] !w-auto !py-1 !text-[12.5px]" value={c.goal_id} onChange={(e) => setCands((cs) => cs.map((x) => (x.isin === c.isin ? { ...x, goal_id: e.target.value } : x)))} aria-label={`Goal for ${c.name}`}>
                        <option value="">No goal</option>{data.goals.filter((g) => g.active !== false).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                      </select>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {missing.length > 0 && (
            <Card title="Earlier CAS holdings not in this statement">
              <p className="mb-3 text-[13px] text-soft">Tick any you have sold or closed to stop counting them.</p>
              <ul className="space-y-1.5">
                {missing.map((h) => (
                  <li key={h.id}><label className="flex items-center gap-2 text-[13.5px]"><input type="checkbox" checked={!!closing[h.id]} onChange={(e) => setClosing((c) => ({ ...c, [h.id]: e.target.checked }))} className="h-4 w-4 accent-[var(--gold-fill)]" />{h.name}</label></li>
                ))}
              </ul>
            </Card>
          )}

          {error && <p className="rounded-lg bg-rust-soft px-3 py-2 text-[13px] text-rust">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <Btn variant="primary" onClick={doImport} disabled={step === 'importing' || sel.length === 0}>{step === 'importing' ? 'Importing…' : `Import ${sel.length} holding${sel.length === 1 ? '' : 's'}`}</Btn>
            <Btn onClick={reset} disabled={step === 'importing'}><X size={15} />Start over</Btn>
          </div>
        </>
      )}

      {step === 'done' && result && (
        <Card>
          <div className="mx-auto max-w-md py-4 text-center">
            <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-sage-soft text-sage"><Check size={22} /></span>
            <h2 className="mt-3 font-display text-[21px] font-semibold">Statement imported</h2>
            <p className="mt-1 text-[13.5px] text-soft">{result.added} new, {result.updated} updated{result.sips ? `, ${result.sips} SIP${result.sips > 1 ? 's' : ''} added` : ''}{result.closed ? `, ${result.closed} closed` : ''}. Prices will refresh on the next daily update.</p>
            <div className="mt-4 flex justify-center gap-2"><Link to="/invest/holdings" className="btn btn-primary">See holdings</Link><Btn onClick={reset}>Import another</Btn></div>
          </div>
        </Card>
      )}
    </div>
  )
}
