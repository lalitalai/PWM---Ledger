import { useRef, useState } from 'react'
import { AlertTriangle, Check, FileUp, Lock, ShieldCheck, X } from 'lucide-react'
import { useData } from '../../ctx/DataContext.jsx'
import { Badge, Btn, Card, Field, Input, Select, cx } from '../../components/ui.jsx'
import { readStatementPdf, PasswordNeeded } from '../../lib/statement/pdf.js'
import { parseStatementCsv } from '../../lib/statement/csv.js'
import { guessCategory } from '../../lib/statement/parse.js'
import { reconcile, MATCH_BADGE } from '../../lib/statement/reconcile.js'
import { EXPENSE_CATEGORIES } from '../../lib/constants.js'
import { inr } from '../../lib/format.js'

let seq = 0
const uid = () => `imp-${++seq}`

// A ref (UPI ref no. / transaction id) is tucked onto the saved expense's own note, so re-opening
// the same statement - or a different statement that covers an overlapping day, e.g. a UPI app's
// history and the underlying bank statement for the same account - can tell "already imported"
// from "new" without needing a schema change.
const REF_TAG_RE = /·\s*ref:(\S+)/
const noteWithRef = (description, ref) => (ref ? `${description || ''} · ref:${ref}`.trim() : description || null)
const existingRefs = (expenses) => new Set(expenses.map((e) => e.note?.match(REF_TAG_RE)?.[1]).filter(Boolean))

const CAS_MESSAGE = "This looks like a CAS (holdings) statement from CDSL/NSDL/CAMS/KFintech, not a bank or UPI transaction history - there's nothing to import here as expenses. Use Invest → Import CAS for this file instead."

export default function Import() {
  const { addMany, people, me, notify, data, settings, saveSettings } = useData()
  const [step, setStep] = useState('idle') // idle | reading | password | review | importing | done
  const [file, setFile] = useState(null)
  const [pw, setPw] = useState('')
  const [wrongPw, setWrongPw] = useState(false)
  const [error, setError] = useState(null)
  const [rows, setRows] = useState([])
  const [pageCount, setPageCount] = useState(0)
  const [source, setSource] = useState(null)
  const [result, setResult] = useState(null)
  const [aliasText, setAliasText] = useState((settings?.transferAliases || []).join(', '))
  const input = useRef(null)
  const catList = [...new Set([...EXPENSE_CATEGORIES, ...data.expenses.map((e) => e.category)])]

  const reset = () => { setStep('idle'); setFile(null); setPw(''); setError(null); setRows([]); setResult(null); setWrongPw(false); setSource(null); if (input.current) input.current.value = '' }

  // Two independent checks, both only ever untick (never delete) a row: the exact ref match against
  // earlier imports, then reconcile() against what the app already tracks - auto-posted SIP and EMI
  // instalments, hand-entered additional investments and expenses - plus money that is not spending
  // at all (broker/MF transfers, card bill payments, transfers between household members).
  const toRows = (parsed, dupRefs, aliases = settings?.transferAliases || []) => reconcile(parsed, data, { people, aliases }).map((r, i) => {
    const isDup = !!(r.ref && dupRefs.has(r.ref))
    const match = isDup ? null : r.match || null
    const hinted = (r.categoryHint && catList.includes(r.categoryHint)) ? r.categoryHint : guessCategory(r.description, catList)
    return {
      key: uid(), idx: i, raw: parsed[i], date: r.date, description: r.description, amount: r.amount, direction: r.direction, ref: r.ref || null, duplicate: isDup, match,
      include: r.direction === 'debit' && !isDup && !match,
      category: match?.kind === 'card_payment' && catList.includes('Credit Card Payment') ? 'Credit Card Payment' : hinted,
      person: me || people[0] || '',
    }
  })

  const readCsv = async (f) => {
    const text = await f.text()
    const { rows: parsed, error: csvError } = parseStatementCsv(text)
    if (csvError) { setError(csvError); setStep('idle'); return }
    if (!parsed.length) { setError('No transactions could be recognised in this CSV. Check that it has a Date column and a Debit/Credit (or Amount) column.'); setStep('idle'); return }
    setSource('CSV'); setPageCount(0)
    setRows(toRows(parsed, existingRefs(data.expenses)))
    setStep('review')
  }

  const readPdf = async (f, password) => {
    const { rows: parsed, pageCount: pc, source: src, reason } = await readStatementPdf(f, password)
    setPageCount(pc); setSource(src)
    if (reason === 'cas') { setError(CAS_MESSAGE); setStep('idle'); return }
    if (!parsed.length) { setError('No transactions could be recognised in this PDF. Every statement is laid out a bit differently - if this keeps happening, add the expenses one by one or several at once instead.'); setStep('idle'); return }
    setRows(toRows(parsed, existingRefs(data.expenses)))
    setStep('review')
  }

  const read = async (f, password) => {
    setStep('reading'); setError(null)
    try {
      const isCsv = /\.(csv|txt)$/i.test(f.name) || f.type === 'text/csv'
      if (isCsv) await readCsv(f)
      else await readPdf(f, password)
    } catch (e) {
      if (e instanceof PasswordNeeded) { setWrongPw(e.wrong); setStep('password'); return }
      setError(`Could not read this file (${e.message || e}). Make sure it is a text-based statement PDF (not a scanned image) or a CSV export.`); setStep('idle')
    }
  }

  const pick = (e) => { const f = e.target.files?.[0]; if (!f) return; setFile(f); setPw(''); read(f) }
  const onDrop = (e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) { setFile(f); setPw(''); read(f) } }
  // Re-run the reconcile step with new name spellings, keeping every edit already made to a row
  // (date, description, category, person, amount) - only the "why unticked" flag and tick are redone.
  const recheck = async () => {
    const aliases = aliasText.split(',').map((a) => a.trim()).filter(Boolean)
    try { await saveSettings({ transferAliases: aliases }) } catch { /* toast shown by the store; still re-check locally */ }
    const fresh = toRows(rows.map((r) => r.raw), existingRefs(data.expenses), aliases)
    setRows((rs) => rs.map((r, i) => ({ ...r, match: fresh[i].match, duplicate: fresh[i].duplicate, include: fresh[i].include })))
    notify('Re-checked with your names')
  }
  const setRow = (key, patch) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  const sel = rows.filter((r) => r.include)
  const debits = rows.filter((r) => r.direction === 'debit').length
  const credits = rows.length - debits
  const dupCount = rows.filter((r) => r.duplicate).length
  const trackedCount = rows.filter((r) => r.match?.recorded).length
  const notSpendCount = rows.filter((r) => r.match && !r.match.recorded).length

  const doImport = async () => {
    setStep('importing')
    try {
      const body = sel.map((r) => ({ date: r.date, person: r.person, category: r.category, note: noteWithRef(r.description, r.ref), amount: r.amount, payment_method: 'bank_upi', bank_account_id: null, credit_card_id: null }))
      await addMany('expenses', body)
      setResult({ count: body.length, total: body.reduce((s, r) => s + r.amount, 0) })
      setStep('done')
      notify(`Imported ${body.length} expenses`)
    } catch (e) { setError(e.message); setStep('review') }
  }

  const found = pageCount > 0
    ? `Found ${rows.length} transaction${rows.length === 1 ? '' : 's'} across ${pageCount} page${pageCount === 1 ? '' : 's'}`
    : `Found ${rows.length} transaction${rows.length === 1 ? '' : 's'} in the CSV`

  return (
    <div className="space-y-5">
      <Card>
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 shrink-0 text-sage" size={20} />
          <div className="text-[13.5px] text-soft">
            <p className="text-ink"><b>Upload a Paytm, Google Pay, bank statement PDF, or a bank/UPI CSV export</b> to pull in transactions in bulk.</p>
            <p className="mt-1">Everything is read <b>inside your browser</b> - it is never uploaded. Every statement is formatted differently, so treat this as a head start: review every row, fix the date, category or amount where needed, and untick anything that is not really an expense (like an incoming credit, or a transaction you've already imported from another statement) before importing.</p>
          </div>
        </div>
      </Card>

      {(step === 'idle' || step === 'reading') && (
        <div onDragOver={(e) => e.preventDefault()} onDrop={onDrop}
          className="flex flex-col items-center rounded-xl border-2 border-dashed border-line-strong bg-surface px-4 py-12 text-center">
          <FileUp size={30} className="text-gold" />
          <p className="mt-3 text-[15px] font-medium">{step === 'reading' ? 'Reading the statement…' : 'Drop your statement PDF or CSV here'}</p>
          <p className="mt-1 text-[13px] text-soft">{step === 'reading' ? file?.name : 'or choose the file from your device'}</p>
          <input ref={input} id="stmt-file" type="file" accept="application/pdf,.pdf,.csv,.txt,text/csv" className="sr-only" onChange={pick} disabled={step === 'reading'} />
          <label htmlFor="stmt-file" className={cx('btn btn-primary mt-4', step === 'reading' && 'pointer-events-none opacity-50')}>Choose file</label>
          {error && <p className="mt-4 max-w-md rounded-lg bg-rust-soft px-3 py-2 text-[13px] text-rust"><AlertTriangle size={14} className="mr-1 inline" />{error}</p>}
        </div>
      )}

      {step === 'password' && (
        <Card>
          <form className="mx-auto max-w-sm space-y-3" onSubmit={(e) => { e.preventDefault(); read(file, pw) }}>
            <Lock className="text-gold" size={22} />
            <h2 className="font-display text-[19px] font-semibold">This PDF is password-protected</h2>
            <p className="text-[13px] text-soft">It is used only to open the file here and is not saved.</p>
            <Field label="Password" error={wrongPw ? 'That password did not work - try again' : null}><Input type="password" autoFocus autoComplete="off" value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
            <div className="flex gap-2"><Btn variant="primary" type="submit" disabled={!pw}>Unlock</Btn><Btn type="button" onClick={reset}>Cancel</Btn></div>
          </form>
        </Card>
      )}

      {(step === 'review' || step === 'importing') && rows.length > 0 && (
        <>
          <Card title={found}>
            <p className="text-[13px] text-soft">
              {source && <>Detected as <b>{source}</b>. </>}
              {debits} look like payments (ticked by default){credits ? `, ${credits} look like money coming in (unticked)` : ''}
              {dupCount ? `, ${dupCount} look like something you've already imported (unticked)` : ''}
              {trackedCount ? `, ${trackedCount} are already tracked elsewhere in the app - SIP/EMI instalments, investments or expenses you entered (unticked)` : ''}
              {notSpendCount ? `, ${notSpendCount} look like investments, loan EMIs, card bill payments or transfers between you rather than spending (unticked)` : ''}. Recognition is best-effort - please check each row; the reason is shown under any row that was unticked for you.
            </p>
          </Card>
          <Card>
            <form className="flex flex-col gap-2 md:flex-row md:items-end" onSubmit={(e) => { e.preventDefault(); recheck() }}>
              <div className="flex-1">
                <Field label="Your names as banks print them (comma-separated)">
                  <Input placeholder="e.g. suj kothav, Lalit Alai, Anil Alai" value={aliasText} onChange={(e) => setAliasText(e.target.value)} />
                </Field>
                <p className="mt-1 text-[12px] text-muted">{people.filter((p) => p !== 'Joint').join(' and ')} are already recognised. Banks often shorten names ("suj kothav") - add those here, plus anyone else whose transfers you don't count as spending. Saved for next time.</p>
              </div>
              <Btn type="submit">Save &amp; re-check</Btn>
            </form>
          </Card>
          <Card title="Transactions" pad={false}>
            <div className="scroll-x p-2 md:p-3">
              <table className="w-full min-w-[860px] text-[13px]">
                <thead><tr><th className="th w-8" /><th className="th">Date</th><th className="th">Description</th><th className="th">Category</th><th className="th">Spent by</th><th className="th text-right">Amount</th><th className="th" /></tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.key} className={r.include ? '' : 'opacity-50'}>
                      <td className="td"><input type="checkbox" checked={r.include} onChange={(e) => setRow(r.key, { include: e.target.checked })} className="h-4 w-4 accent-[var(--gold-fill)]" aria-label={`Import ${r.description}`} /></td>
                      <td className="td"><Input type="date" className="!min-h-[32px] !w-[140px] !py-1 !text-[12.5px]" value={r.date} onChange={(e) => setRow(r.key, { date: e.target.value })} /></td>
                      <td className="td min-w-[200px]">
                        <Input className="!min-h-[32px] !py-1 !text-[12.5px]" value={r.description} onChange={(e) => setRow(r.key, { description: e.target.value })} />
                        {r.match && <p className="mt-1 max-w-[380px] text-[11.5px] leading-snug text-muted">{r.match.label}</p>}
                      </td>
                      <td className="td"><Select className="!min-h-[32px] !min-w-[140px] !py-1 !text-[12.5px]" value={r.category} onChange={(e) => setRow(r.key, { category: e.target.value })}>{catList.map((c) => <option key={c}>{c}</option>)}</Select></td>
                      <td className="td"><Select className="!min-h-[32px] !min-w-[110px] !py-1 !text-[12.5px]" value={r.person} onChange={(e) => setRow(r.key, { person: e.target.value })}>{[...people, 'Joint'].map((p) => <option key={p}>{p}</option>)}</Select></td>
                      <td className="td tnum text-right"><Input type="number" min="0" step="0.01" className="!min-h-[32px] !w-[100px] !py-1 !text-right !text-[12.5px]" value={r.amount} onChange={(e) => setRow(r.key, { amount: Number(e.target.value) || 0 })} /></td>
                      <td className="td">
                        {r.duplicate && <Badge tone="gold">maybe duplicate</Badge>}
                        {!r.duplicate && r.match && <Badge tone={r.match.recorded ? 'gold' : 'sky'}>{r.match.recorded ? `already tracked · ${MATCH_BADGE[r.match.kind]}` : MATCH_BADGE[r.match.kind]}</Badge>}
                        {!r.duplicate && !r.match && (r.direction === 'credit' ? <Badge tone="sage">money in</Badge> : <Badge tone="rust">payment</Badge>)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="px-5 pb-4 text-[12px] text-muted">Every imported row is added as a normal expense (Bank Transfer / UPI) - edit the payment method afterwards from the transactions list if any of these were actually on a card.</p>
          </Card>
          {error && <p className="rounded-lg bg-rust-soft px-3 py-2 text-[13px] text-rust">{error}</p>}
          <div className="flex flex-wrap items-center gap-3">
            <Btn variant="primary" onClick={doImport} disabled={step === 'importing' || sel.length === 0}>{step === 'importing' ? 'Importing…' : `Import ${sel.length} expense${sel.length === 1 ? '' : 's'} · ${inr(sel.reduce((s, r) => s + (Number(r.amount) || 0), 0))}`}</Btn>
            <Btn onClick={reset} disabled={step === 'importing'}><X size={15} />Start over</Btn>
          </div>
        </>
      )}

      {step === 'done' && result && (
        <Card>
          <div className="mx-auto max-w-md py-4 text-center">
            <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-sage-soft text-sage"><Check size={22} /></span>
            <h2 className="mt-3 font-display text-[21px] font-semibold">Expenses imported</h2>
            <p className="mt-1 text-[13.5px] text-soft">{result.count} expenses added, totalling {inr(result.total)}.</p>
            <div className="mt-4 flex justify-center gap-2"><Btn variant="primary" onClick={reset}>Import another statement</Btn></div>
          </div>
        </Card>
      )}
    </div>
  )
}
