import { useState } from 'react'
import { ChevronDown, ChevronRight, Pencil, Plus, Repeat, Undo2 } from 'lucide-react'
import { useData } from '../../ctx/DataContext.jsx'
import { Badge, Btn, Card, ConfirmDelete, Empty, Field, Input, Modal, PersonTag, Select, Stat, StatStrip, Textarea, cx } from '../../components/ui.jsx'
import { BankSelect, GoalSelect, PersonSelect, useForm, numOrNull, nz } from '../../components/forms.jsx'
import { FUND_CATEGORIES, isUnitBased } from '../../lib/constants.js'
import { inr, inrDecimal, units as fmtUnits } from '../../lib/format.js'
import { dateLabel, dateShort, dayBefore, monthlyDates, ordinal } from '../../lib/dates.js'
import { monthlySipTotal, upcomingSips } from '../../lib/schedule.js'

export function SipModal({ row, onClose, defaults = {} }) {
  const { add, edit, data, today, me, people, notify } = useData()
  const [f, set] = useForm({
    fund_name: row?.fund_name || defaults.fund_name || '', category: row?.category || defaults.category || '', amount: row?.amount ?? defaults.amount ?? '', sip_day: row?.sip_day ?? defaults.sip_day ?? '',
    start_date: row?.start_date || today, end_date: row?.end_date || '', person: row?.person || me || people[0] || '', bank_account_id: row?.bank_account_id || '', goal_id: row?.goal_id || '',
    holding_id: row ? row.holding_id || '' : defaults.holding_id || '__new', isin: row?.isin || defaults.isin || '', amfi_code: row?.amfi_code || '', notes: row?.notes || '', active: row?.active ?? true,
  })
  const funds = data.holdings.filter((h) => h.active !== false && isUnitBased(h.asset_type))
  const day = numOrNull(f.sip_day)
  const backfill = !row && day && f.start_date ? monthlyDates(day, f.start_date, today) : []

  // choosing an existing investment pre-fills the details
  const pick = (e) => {
    const id = e.target.value
    const h = funds.find((x) => x.id === id)
    set('holding_id')(id)
    if (h) { if (!f.fund_name) set('fund_name')(h.name); if (!f.category && h.category) set('category')(h.category); if (h.person) set('person')(h.person) }
  }

  const save = async (e) => {
    e.preventDefault()
    if (!(day >= 1 && day <= 31)) return notify('SIP date must be between 1 and 31', 'error')
    try {
      let holdingId = f.holding_id || null
      if (holdingId === '__new') {
        const h = await add('holdings', {
          name: f.fund_name.trim(), asset_type: 'mutual_fund', category: nz(f.category), person: f.person, isin: nz(f.isin.trim().toUpperCase()), amfi_code: nz(String(f.amfi_code).trim()),
          units: 0, invested_amount: 0, price: null, baseline_date: dayBefore(f.start_date), goal_id: f.goal_id || null, source: 'sip', cost_known: true, active: true,
        })
        holdingId = h.id
      }
      const body = {
        fund_name: f.fund_name.trim(), category: nz(f.category), amount: numOrNull(f.amount), sip_day: day, start_date: f.start_date, end_date: nz(f.end_date), person: f.person,
        bank_account_id: f.bank_account_id || null, goal_id: f.goal_id || null, holding_id: holdingId, isin: nz(f.isin.trim().toUpperCase()), amfi_code: nz(String(f.amfi_code).trim()), notes: nz(f.notes.trim()), active: f.active,
      }
      if (row) await edit('sip_master', row.id, body); else await add('sip_master', body)
      notify(row ? 'SIP updated' : backfill.length > 1 ? `SIP added - ${backfill.length} instalments posted up to today` : 'SIP added - it will post automatically on its date')
      onClose()
    } catch { /* toast */ }
  }

  return (
    <Modal open wide onClose={onClose} title={row ? 'Edit SIP' : 'New SIP'} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn variant="primary" type="submit" form="sip-form">Save SIP</Btn></>}>
      <form id="sip-form" onSubmit={save} className="grid gap-3.5 sm:grid-cols-2">
        <Field label="Fund name" className="sm:col-span-2"><Input required autoFocus={!row} value={f.fund_name} onChange={set('fund_name')} placeholder="e.g. UTI Nifty 50 Index Fund - Direct Growth" /></Field>
        <Field label="Fund category"><Select value={f.category} onChange={set('category')}><option value="">Choose…</option>{FUND_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</Select></Field>
        <Field label="SIP amount (₹)"><Input required type="number" min="1" step="any" inputMode="decimal" value={f.amount} onChange={set('amount')} /></Field>
        <Field label="SIP date (day of month)" hint="31 means the last day in shorter months"><Input required type="number" min="1" max="31" inputMode="numeric" value={f.sip_day} onChange={set('sip_day')} /></Field>
        <Field label="Started on" hint={row ? 'Moving this earlier posts the missing months' : 'Pick today unless the SIP is already running'}><Input required type="date" value={f.start_date} onChange={set('start_date')} /></Field>
        <Field label="Ends on (optional)"><Input type="date" value={f.end_date} onChange={set('end_date')} /></Field>
        <PersonSelect value={f.person} onChange={set('person')} label="Whose SIP" />
        <BankSelect value={f.bank_account_id} onChange={set('bank_account_id')} label="Debited from" />
        <GoalSelect value={f.goal_id} onChange={set('goal_id')} label="Goal this SIP is for" />
        <Field label="Investment it feeds" hint="Units and value roll up here">
          <Select value={f.holding_id} onChange={pick}>
            <option value="__new">Create a new investment for this SIP</option>
            {row && !row.holding_id && <option value="">Not linked</option>}
            {funds.map((h) => <option key={h.id} value={h.id}>{h.name}{h.person ? ` (${h.person})` : ''}</option>)}
          </Select>
        </Field>
        {f.holding_id === '__new' && (
          <>
            <Field label="ISIN (optional)" hint="Lets the daily job find the NAV"><Input value={f.isin} onChange={set('isin')} maxLength={12} placeholder="INF…" /></Field>
            <Field label="AMFI scheme code (optional)"><Input inputMode="numeric" value={f.amfi_code} onChange={set('amfi_code')} /></Field>
          </>
        )}
        <label className="flex items-center gap-2 text-[13.5px] sm:col-span-2"><input type="checkbox" checked={f.active} onChange={set('active')} className="h-4 w-4 accent-[var(--gold-fill)]" />Active - untick to pause (no new instalments)</label>
        {!row && backfill.length > 0 && (
          <div className="rounded-lg bg-gold-soft px-3 py-2.5 text-[12.5px] text-ink sm:col-span-2">
            Because it started {dateLabel(f.start_date)}, <b>{backfill.length} instalment{backfill.length > 1 ? 's' : ''}</b> ({inr(backfill.length * (numOrNull(f.amount) || 0))}) will be recorded as paid right away. If some were missed, remove them afterwards.
          </div>
        )}
        <Field label="Notes" className="sm:col-span-2"><Textarea value={f.notes} onChange={set('notes')} /></Field>
      </form>
    </Modal>
  )
}

function Installments({ sip }) {
  const { data, skipRow, restoreRow, notify } = useData()
  const rows = data.sip_installments.filter((i) => i.sip_id === sip.id).sort((a, b) => (a.due_date < b.due_date ? 1 : -1))
  if (!rows.length) return <p className="px-4 py-3 text-[13px] text-muted">No instalments yet - the first one posts on the SIP date.</p>
  const act = async (fn, msg) => { try { await fn(); notify(msg) } catch { /* toast */ } }
  return (
    <ul className="max-h-72 divide-y divide-line overflow-y-auto px-3 text-[13px] md:px-4">
      {rows.map((i) => {
        const skipped = i.status === 'skipped'
        return (
          <li key={i.id} className={cx('flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 py-2.5', skipped && 'text-muted')}>
            <div className="min-w-0">
              <div className="flex items-baseline gap-2.5"><span className="whitespace-nowrap font-medium">{dateLabel(i.due_date)}</span><span className={cx('tnum', skipped && 'line-through')}>{inr(i.amount)}</span></div>
              <div className="tnum text-[12px] text-muted">{i.units ? `${fmtUnits(i.units)} units${i.nav ? ` @ ${inrDecimal(i.nav)}` : ''}` : 'units pending - filled in by the daily price job'}</div>
            </div>
            <div className="flex items-center gap-1.5">
              {skipped ? <Badge tone="rust">Missed</Badge> : <Badge tone="sage">Paid{i.source === 'auto' ? ' · auto' : ''}</Badge>}
              {skipped
                ? <Btn size="sm" variant="ghost" onClick={() => act(() => restoreRow('sip_installments', i.id), 'Instalment restored')}><Undo2 size={14} />Restore</Btn>
                : <ConfirmDelete label="Missed - remove" confirmLabel="Yes, remove" onConfirm={() => act(() => skipRow('sip_installments', i.id), 'Instalment removed - it will not be re-created')} />}
            </div>
          </li>
        )
      })}
    </ul>
  )
}

export default function Sips() {
  const { data, derived, today, del, edit, notify, people } = useData()
  const [modal, setModal] = useState(null)
  const [open, setOpen] = useState(null)
  const [fPerson, setFPerson] = useState('')
  const [fStatus, setFStatus] = useState('')
  const status = (s) => (s.active === false ? ['Paused', 'neutral'] : s.end_date && s.end_date < today ? ['Ended', 'neutral'] : ['Active', 'sage'])
  const sips = [...data.sip_master]
    .filter((s) => (!fPerson || s.person === fPerson) && (!fStatus || status(s)[0] === fStatus))
    .sort((a, b) => Number(a.sip_day) - Number(b.sip_day))
  const next = upcomingSips(data.sip_master, today, 40)[0]
  const paid = data.sip_installments.filter((i) => i.status === 'paid').reduce((s, i) => s + Number(i.amount), 0)
  const tag = async (s, goal_id) => { try { await edit('sip_master', s.id, { goal_id: goal_id || null }); notify(goal_id ? 'SIP tagged to goal' : 'Goal tag removed') } catch { /* toast */ } }

  return (
    <>
      <StatStrip cols={4}>
        <Stat big label="Monthly SIPs" value={inr(monthlySipTotal(data.sip_master))} sub={`${data.sip_master.filter((s) => s.active !== false).length} active`} />
        <Stat label="Next debit" value={next ? dateShort(next.date) : '—'} sub={next ? `${next.sip.fund_name.slice(0, 26)}…` : undefined} />
        <Stat label="Posted so far" value={inr(paid)} sub={`${data.sip_installments.filter((i) => i.status === 'paid').length} instalments`} />
        <Stat label="Missed & removed" value={String(data.sip_installments.filter((i) => i.status === 'skipped').length)} sub="kept so they are not re-created" />
      </StatStrip>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[13px] text-soft"><Repeat size={14} className="text-sage" />Every SIP is recorded as paid on its date - no entry needed. Missed one? Open the SIP and remove that month.</p>
        <Btn variant="primary" onClick={() => setModal({})}><Plus size={16} />New SIP</Btn>
      </div>
      {data.sip_master.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          <Select className="!w-auto" value={fPerson} onChange={(e) => setFPerson(e.target.value)} aria-label="Person"><option value="">Everyone</option>{[...people, 'Joint'].map((p) => <option key={p}>{p}</option>)}</Select>
          <Select className="!w-auto" value={fStatus} onChange={(e) => setFStatus(e.target.value)} aria-label="Status"><option value="">Any status</option><option>Active</option><option>Paused</option><option>Ended</option></Select>
        </div>
      )}

      {sips.length === 0 ? <Empty title={data.sip_master.length ? 'Nothing matches' : 'No SIPs yet'} hint={data.sip_master.length ? 'Change the filters above.' : 'Add a SIP once - fund, category, amount and date - and it posts every month by itself.'} action={!data.sip_master.length && <Btn variant="primary" onClick={() => setModal({})}>Add SIP</Btn>} /> : (
        <Card pad={false}>
          <ul className="divide-y divide-line">
            {sips.map((s) => {
              const [label, tone] = status(s)
              const isOpen = open === s.id
              const bank = s.bank_account_id && derived.maps.bank[s.bank_account_id]
              return (
                <li key={s.id}>
                  <div className="grid gap-x-3 gap-y-2 p-3.5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:px-5">
                    <div className="flex min-w-0 items-start gap-2">
                      <button className="mt-0.5 shrink-0 rounded p-1 text-muted hover:bg-sunken" aria-label={isOpen ? 'Hide instalments' : 'Show instalments'} aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : s.id)}>{isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</button>
                      <div className="min-w-0">
                        <div className="font-medium leading-snug">{s.fund_name}</div>
                        <div className="text-[12px] text-muted">{s.category || 'No category'}{bank ? ` · ${bank.name}` : ''}</div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5"><Badge tone={tone}>{label}</Badge><PersonTag name={s.person} /></div>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pl-9 md:pl-0">
                      <div className="tnum"><span className="text-[15px] font-semibold">{inr(s.amount)}</span><span className="ml-1.5 text-[12px] text-muted">on the {ordinal(s.sip_day)}</span></div>
                      <select className="field-input !min-h-[32px] !w-auto !min-w-[150px] !py-1 !text-[12.5px]" value={s.goal_id || ''} onChange={(e) => tag(s, e.target.value)} aria-label={`Goal for ${s.fund_name}`}>
                        <option value="">Goal: none</option>
                        {data.goals.filter((g) => g.active !== false).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                      </select>
                      <div className="ml-auto flex items-center md:ml-0">
                        <Btn size="sm" variant="ghost" aria-label={`Edit ${s.fund_name}`} onClick={() => setModal({ row: s })}><Pencil size={14} /></Btn>
                        <ConfirmDelete onConfirm={async () => { try { await del('sip_master', s.id); notify('SIP and its instalments deleted') } catch { /* toast */ } }} />
                      </div>
                    </div>
                  </div>
                  {isOpen && <div className="border-t border-line bg-sunken/60 py-1"><Installments sip={s} /></div>}
                </li>
              )
            })}
          </ul>
        </Card>
      )}
      {modal && <SipModal row={modal.row} onClose={() => setModal(null)} />}
    </>
  )
}
