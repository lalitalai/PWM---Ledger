import { useState } from 'react'
import { useData } from '../../ctx/DataContext.jsx'
import { Badge, Btn, Card, ConfirmDelete, Field, Input, Segmented, Select, Table, Textarea } from '../../components/ui.jsx'
import { BankSelect, HoldingSelect, PersonSelect, useForm, numOrNull, nz } from '../../components/forms.jsx'
import { ASSET_TYPES, FUND_CATEGORIES, isUnitBased } from '../../lib/constants.js'
import { inr, units as fmtUnits } from '../../lib/format.js'
import { dateLabel, dayBefore } from '../../lib/dates.js'

/** Manual entry for the two things that are NOT automatic: an extra (lump-sum) investment, or a withdrawal. */
export default function AddInvestment() {
  const { data, derived, add, del, today, me, people, notify } = useData()
  const [kind, setKind] = useState('additional')
  const [isNew, setIsNew] = useState(false)
  const [f, set, setF] = useForm({
    date: today, holding_id: '', amount: '', units: '', nav: '', person: me || people[0] || '', bank_account_id: '', note: '',
    n_name: '', n_type: 'mutual_fund', n_category: '',
  })
  const h = derived.maps.holding[f.holding_id]
  const unit = isNew ? isUnitBased(f.n_type) : h ? isUnitBased(h.asset_type) : false

  const submit = async (e) => {
    e.preventDefault()
    const amount = numOrNull(f.amount)
    if (!(amount > 0)) return notify('Enter an amount above zero', 'error')
    try {
      let holding = h
      let hid = f.holding_id
      if (isNew) {
        if (!f.n_name.trim()) return notify('Give the new investment a name', 'error')
        const created = await add('holdings', { name: f.n_name.trim(), asset_type: f.n_type, category: nz(f.n_category), person: f.person, units: 0, invested_amount: 0, price: null, current_value: isUnitBased(f.n_type) ? null : 0,
          baseline_date: dayBefore(f.date), source: 'manual', cost_known: true, active: true })
        hid = created.id; holding = created
      }
      if (!hid) return notify('Choose the investment', 'error')
      // units: use what the user typed, else approximate from the latest price so the value moves right away
      let units = numOrNull(f.units), nav = numOrNull(f.nav)
      if (units == null && nav) units = Math.round((amount / nav) * 1e6) / 1e6
      if (units == null && isUnitBased(holding.asset_type) && Number(holding.price) > 0) { nav = Number(holding.price); units = Math.round((amount / nav) * 1e6) / 1e6 }
      await add('investment_txns', { date: f.date, holding_id: hid, kind, amount, units: unit ? units : null, nav: unit ? nav : null, person: f.person, bank_account_id: f.bank_account_id || null, note: nz(f.note.trim()) })
      notify(kind === 'additional' ? `Added ${inr(amount)} to ${holding.name}` : `Recorded withdrawal of ${inr(amount)}`)
      setF((o) => ({ ...o, amount: '', units: '', nav: '', note: '' })); setIsNew(false)
    } catch { /* toast */ }
  }

  const recent = [...data.investment_txns].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 15)

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
      <Card title="Additional investment">
        <p className="mb-4 text-[13px] text-soft">SIPs post themselves. Use this only for <b>extra</b> money - a bonus lump sum, a top-up, a one-off purchase - or to record a withdrawal.</p>
        <Segmented className="mb-4" value={kind} onChange={setKind} options={[{ value: 'additional', label: 'Add money' }, { value: 'withdrawal', label: 'Withdraw' }]} />
        <form onSubmit={submit} className="grid gap-3.5 sm:grid-cols-2">
          <Field label="Amount (₹)"><Input required type="number" min="0" step="any" inputMode="decimal" value={f.amount} onChange={set('amount')} className="text-[18px] font-semibold" /></Field>
          <Field label="Date"><Input required type="date" max={today} value={f.date} onChange={set('date')} /></Field>
          <div className="sm:col-span-2">
            {!isNew ? <HoldingSelect value={f.holding_id} onChange={set('holding_id')} label="Which investment" /> : (
              <div className="grid gap-3.5 rounded-lg border border-line bg-sunken p-3.5 sm:grid-cols-2">
                <Field label="New investment name" className="sm:col-span-2"><Input value={f.n_name} onChange={set('n_name')} placeholder="e.g. Quant Small Cap Fund - Direct Growth" /></Field>
                <Field label="Type"><Select value={f.n_type} onChange={set('n_type')}>{ASSET_TYPES.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}</Select></Field>
                <Field label="Category"><Select value={f.n_category} onChange={set('n_category')}><option value="">—</option>{FUND_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</Select></Field>
              </div>
            )}
            <button type="button" className="mt-1.5 text-[12.5px] font-medium text-gold underline" onClick={() => setIsNew((v) => !v)}>{isNew ? 'Pick an existing investment instead' : 'Not in the list? Create a new investment'}</button>
          </div>
          <PersonSelect value={f.person} onChange={set('person')} label="Whose money" />
          <BankSelect value={f.bank_account_id} onChange={set('bank_account_id')} label={kind === 'additional' ? 'Paid from' : 'Credited to'} />
          {unit && (
            <>
              <Field label="Units (optional)" hint="Leave blank to estimate from the latest price"><Input type="number" step="any" min="0" inputMode="decimal" value={f.units} onChange={set('units')} /></Field>
              <Field label="NAV / price paid (optional)"><Input type="number" step="any" min="0" inputMode="decimal" value={f.nav} onChange={set('nav')} /></Field>
            </>
          )}
          <Field label="Note" className="sm:col-span-2"><Textarea value={f.note} onChange={set('note')} placeholder="optional" /></Field>
          <div className="sm:col-span-2"><Btn variant="primary" type="submit">{kind === 'additional' ? 'Save investment' : 'Record withdrawal'}</Btn></div>
        </form>
      </Card>

      <Card title="Recent manual entries" pad={false}>
        <div className="p-2 md:p-3">
          {recent.length === 0 ? <p className="py-8 text-center text-[13px] text-muted">Nothing entered manually yet.</p> : (
            <Table head={['Date', 'Investment', { label: 'Amount', right: true }, '']} className="!min-w-0" stack={false}>
              {recent.map((t) => (
                <tr key={t.id}>
                  <td className="td whitespace-nowrap text-soft">{dateLabel(t.date)}</td>
                  <td className="td max-w-[180px]"><div className="truncate">{derived.maps.holding[t.holding_id]?.name || 'Investment'}</div>{t.units ? <div className="text-[11.5px] text-muted">{fmtUnits(t.units)} units</div> : null}</td>
                  <td className="td tnum whitespace-nowrap text-right">{t.kind === 'withdrawal' ? <Badge tone="rust">− {inr(t.amount)}</Badge> : inr(t.amount)}</td>
                  <td className="td text-right"><ConfirmDelete onConfirm={async () => { try { await del('investment_txns', t.id); notify('Entry deleted') } catch { /* toast */ } }} /></td>
                </tr>
              ))}
            </Table>
          )}
        </div>
      </Card>
    </div>
  )
}
