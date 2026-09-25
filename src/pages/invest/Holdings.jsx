import { useState } from 'react'
import { Plus, Pencil, Search } from 'lucide-react'
import { useData } from '../../ctx/DataContext.jsx'
import { Badge, Btn, Card, ConfirmDelete, Empty, Field, Input, Modal, PersonTag, Select, Table, Textarea } from '../../components/ui.jsx'
import { GoalSelect, PersonSelect, useForm, numOrNull, nz } from '../../components/forms.jsx'
import { ASSET_TYPES, FUND_CATEGORIES, assetLabel, isUnitBased } from '../../lib/constants.js'
import { inr, inrDecimal, pct, units as fmtUnits } from '../../lib/format.js'
import { dateLabel, dateShort } from '../../lib/dates.js'
import { CLASS_COLOR } from '../../components/charts.jsx'

export function HoldingModal({ row, onClose, onSaved, defaults = {} }) {
  const { add, edit, today, me, people, notify } = useData()
  const [f, set] = useForm({
    asset_type: row?.asset_type || defaults.asset_type || 'mutual_fund', name: row?.name || defaults.name || '', category: row?.category || defaults.category || '',
    person: row?.person || me || people[0] || '', isin: row?.isin || '', amfi_code: row?.amfi_code || '', ticker: row?.ticker || '', folio_no: row?.folio_no || '',
    units: row?.units ?? '', invested_amount: row?.invested_amount ?? '', price: row?.price ?? '', current_value: row?.current_value ?? '',
    baseline_date: row?.baseline_date || today, goal_id: row?.goal_id || '', notes: row?.notes || '', active: row?.active ?? true, cost_known: row?.cost_known ?? true,
  })
  const unit = isUnitBased(f.asset_type)
  const fund = f.asset_type === 'mutual_fund' || f.asset_type === 'etf'

  const save = async (e) => {
    e.preventDefault()
    const body = {
      asset_type: f.asset_type, name: f.name.trim(), category: nz(f.category), person: f.person, isin: nz(f.isin.trim().toUpperCase()), amfi_code: nz(String(f.amfi_code).trim()),
      ticker: nz(f.ticker.trim()), folio_no: nz(f.folio_no.trim()), units: unit ? numOrNull(f.units) ?? 0 : null, invested_amount: numOrNull(f.invested_amount) ?? 0,
      price: unit ? numOrNull(f.price) : null, price_date: unit && numOrNull(f.price) ? row?.price_date && Number(row.price) === Number(f.price) ? row.price_date : today : null,
      current_value: unit ? null : numOrNull(f.current_value), baseline_date: f.baseline_date, goal_id: f.goal_id || null, notes: nz(f.notes.trim()), active: f.active, cost_known: f.cost_known,
      source: row?.source || 'manual',
    }
    try { const saved = row ? await edit('holdings', row.id, body) : await add('holdings', body); notify(row ? 'Investment updated' : 'Investment added'); onSaved?.(saved); onClose() } catch { /* toast */ }
  }

  return (
    <Modal open wide onClose={onClose} title={row ? 'Edit investment' : 'Add investment'} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn variant="primary" type="submit" form="holding-form">Save</Btn></>}>
      <form id="holding-form" onSubmit={save} className="grid gap-3.5 sm:grid-cols-2">
        <Field label="Type"><Select value={f.asset_type} onChange={set('asset_type')}>{ASSET_TYPES.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}</Select></Field>
        <PersonSelect value={f.person} onChange={set('person')} label="Held by" />
        <Field label="Name" className="sm:col-span-2"><Input required value={f.name} onChange={set('name')} placeholder={fund ? 'e.g. Parag Parikh Flexi Cap Fund - Direct Growth' : unit ? 'e.g. Infosys Ltd' : 'e.g. PPF - SBI'} /></Field>
        {(fund || f.asset_type === 'gold') && <Field label="Category"><Select value={f.category} onChange={set('category')}><option value="">—</option>{FUND_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</Select></Field>}
        {unit && <Field label="ISIN" hint="Lets the daily job find the price"><Input value={f.isin} onChange={set('isin')} placeholder="INF…/INE…" maxLength={12} /></Field>}
        {f.asset_type === 'mutual_fund' && <Field label="AMFI scheme code" hint="Optional - found automatically from the ISIN"><Input inputMode="numeric" value={f.amfi_code} onChange={set('amfi_code')} /></Field>}
        {(f.asset_type === 'equity' || f.asset_type === 'etf') && <Field label="Ticker (Yahoo Finance)" hint="e.g. INFY.NS or GOLDBEES.NS"><Input value={f.ticker} onChange={set('ticker')} /></Field>}
        {f.asset_type === 'mutual_fund' && <Field label="Folio no."><Input value={f.folio_no} onChange={set('folio_no')} /></Field>}

        <div className="rounded-lg border border-line bg-sunken p-3.5 sm:col-span-2">
          <div className="mb-2.5 text-[12px] text-soft">Figures <b>as of a date</b> - SIP instalments and additional investments made after this date are added on top automatically.</div>
          <div className="grid gap-3.5 sm:grid-cols-2">
            <Field label="As of date"><Input required type="date" value={f.baseline_date} onChange={set('baseline_date')} /></Field>
            {unit && <Field label="Units held"><Input type="number" step="any" min="0" inputMode="decimal" value={f.units} onChange={set('units')} /></Field>}
            <Field label="Amount invested (₹)" hint={f.cost_known ? null : 'Cost is not known for this holding'}><Input type="number" step="any" min="0" inputMode="decimal" value={f.invested_amount} onChange={set('invested_amount')} /></Field>
            {unit ? <Field label="Latest price / NAV (₹)"><Input type="number" step="any" min="0" inputMode="decimal" value={f.price} onChange={set('price')} /></Field>
              : <Field label="Current value (₹)" hint="Update from your passbook / statement"><Input type="number" step="any" min="0" inputMode="decimal" value={f.current_value} onChange={set('current_value')} /></Field>}
          </div>
        </div>
        <GoalSelect value={f.goal_id} onChange={set('goal_id')} label="Count toward goal" />
        <label className="flex items-center gap-2 self-end pb-2 text-[13.5px]"><input type="checkbox" checked={f.active} onChange={set('active')} className="h-4 w-4 accent-[var(--gold-fill)]" />Active (uncheck when sold)</label>
        <Field label="Notes" className="sm:col-span-2"><Textarea value={f.notes} onChange={set('notes')} /></Field>
      </form>
    </Modal>
  )
}

export default function Holdings() {
  const { data, derived, del, edit, notify, people } = useData()
  const [modal, setModal] = useState(null)
  const [q, setQ] = useState('')
  const [person, setPerson] = useState('')
  const [type, setType] = useState('')
  const rows = derived.holdings
    .filter((h) => (!person || h.person === person) && (!type || h.asset_type === type) && (!q || `${h.name} ${h.category || ''}`.toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => b.value - a.value)
  const total = rows.reduce((s, h) => s + h.value, 0)
  const goalName = (id) => derived.maps.goal[id]?.name
  const inactive = data.holdings.filter((h) => h.active === false)

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[180px] flex-1"><Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" /><Input className="pl-9" placeholder="Search investments" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <Select className="!w-auto" value={person} onChange={(e) => setPerson(e.target.value)} aria-label="Person"><option value="">Everyone</option>{[...people, 'Joint'].map((p) => <option key={p}>{p}</option>)}</Select>
        <Select className="!w-auto" value={type} onChange={(e) => setType(e.target.value)} aria-label="Type"><option value="">All types</option>{ASSET_TYPES.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}</Select>
        <Btn variant="primary" onClick={() => setModal({})}><Plus size={16} />Add</Btn>
      </div>
      <Card pad={false}>
        <div className="flex justify-between px-4 pb-1 pt-3.5 text-[13px] text-soft md:px-5"><span>{rows.length} investments</span><span className="tnum font-semibold text-ink">{inr(total)}</span></div>
        {rows.length === 0 ? <div className="p-4"><Empty title="No investments yet" hint="Add them one by one, or import a CDSL/NSDL CAS PDF to bring everything in at once." action={<div className="flex justify-center gap-2"><Btn variant="primary" onClick={() => setModal({})}>Add investment</Btn></div>} /></div> : (
          <>
            <ul className="divide-y divide-line px-4 pb-2 md:hidden">
              {rows.map((h) => (
                <li key={h.id} className="flex items-start justify-between gap-3 py-3">
                  <div className="flex min-w-0 items-start gap-2">
                    <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: CLASS_COLOR[h.assetClass] }} />
                    <div className="min-w-0">
                      <div className="text-[14px] font-medium leading-snug">{h.name}</div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[12px] text-muted">
                        <span>{assetLabel(h.asset_type)}{h.category ? ` · ${h.category}` : ''}</span><PersonTag name={h.person} />
                        {h.goal_id && goalName(h.goal_id) && <Badge tone="gold">{goalName(h.goal_id)}</Badge>}
                      </div>
                      {isUnitBased(h.asset_type) && <div className="tnum mt-1 text-[12px] text-muted">{fmtUnits(h.units)} units{h.price ? ` @ ${inrDecimal(h.price)}` : ''}{h.pending > 0 ? ' · recent instalments at cost' : ''}</div>}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="tnum text-[14px] font-semibold">{inr(h.value)}</div>
                    <div className={`tnum text-[12px] ${h.gain == null ? 'text-muted' : h.gain >= 0 ? 'text-sage' : 'text-rust'}`}>{h.gain == null ? 'cost n/a' : `${inr(h.gain, { sign: true })} · ${pct(h.gainPct)}`}</div>
                    <div className="-mr-2 mt-0.5 flex justify-end"><Btn size="sm" variant="ghost" aria-label={`Edit ${h.name}`} onClick={() => setModal({ row: data.holdings.find((x) => x.id === h.id) })}><Pencil size={14} /></Btn>
                      <ConfirmDelete onConfirm={async () => { try { await del('holdings', h.id); notify('Investment deleted') } catch { /* toast */ } }} /></div>
                  </div>
                </li>
              ))}
            </ul>
            <div className="hidden md:block">
          <Table stack={false} className="px-2 pb-2" head={['Investment', 'Holder', { label: 'Units', right: true }, { label: 'Price', right: true }, { label: 'Value', right: true }, { label: 'Gain', right: true }, '']}>
              {rows.map((h) => (
                <tr key={h.id}>
                  <td className="td min-w-[220px]">
                    <div className="flex items-start gap-2">
                      <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: CLASS_COLOR[h.assetClass] }} title={h.assetClass} />
                      <div className="min-w-0">
                        <div className="font-medium leading-snug">{h.name}</div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[12px] text-muted">
                          <span>{assetLabel(h.asset_type)}{h.category ? ` · ${h.category}` : ''}</span>
                          {h.goal_id && goalName(h.goal_id) && <Badge tone="gold">{goalName(h.goal_id)}</Badge>}
                          {h.pending > 0 && <Badge tone="neutral" className="!text-[10.5px]">recent instalments at cost</Badge>}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="td"><PersonTag name={h.person} /></td>
                  <td className="td tnum text-right text-soft">{isUnitBased(h.asset_type) ? fmtUnits(h.units) : '—'}</td>
                  <td className="td tnum whitespace-nowrap text-right text-soft">{h.price ? <>{inrDecimal(h.price)}<div className="text-[11px] text-muted">{dateShort(h.price_date)}</div></> : '—'}</td>
                  <td className="td tnum text-right font-medium">{inr(h.value)}</td>
                  <td className={`td tnum whitespace-nowrap text-right ${h.gain == null ? 'text-muted' : h.gain >= 0 ? 'text-sage' : 'text-rust'}`}>
                    {h.gain == null ? <span title="Cost is not in the demat statement. Edit the holding to add it.">cost n/a</span> : <>{inr(h.gain, { sign: true })}<div className="text-[11px]">{pct(h.gainPct)}</div></>}
                  </td>
                  <td className="td whitespace-nowrap text-right"><Btn size="sm" variant="ghost" aria-label={`Edit ${h.name}`} onClick={() => setModal({ row: data.holdings.find((x) => x.id === h.id) })}><Pencil size={14} /></Btn>
                    <ConfirmDelete onConfirm={async () => { try { await del('holdings', h.id); notify('Investment deleted') } catch { /* toast */ } }} /></td>
                </tr>
              ))}
            </Table>
            </div>
          </>
        )}
      </Card>
      {inactive.length > 0 && (
        <Card title={`Sold / closed (${inactive.length}) - not counted in totals`} className="mt-5">
          <ul className="divide-y divide-line">
            {inactive.map((h) => (
              <li key={h.id} className="flex items-center justify-between gap-3 py-2 text-[13px]">
                <span className="min-w-0 truncate text-soft">{h.name}</span>
                <Btn size="sm" onClick={async () => { try { await edit('holdings', h.id, { active: true }); notify('Investment reactivated') } catch { /* toast */ } }}>Reactivate</Btn>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {modal && <HoldingModal row={modal.row} onClose={() => setModal(null)} />}
    </>
  )
}
