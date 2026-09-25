import { useMemo, useState } from 'react'
import { Plus, Undo2 } from 'lucide-react'
import { useData } from '../../ctx/DataContext.jsx'
import { Badge, Btn, Card, ConfirmDelete, Empty, Field, Input, Select, Stat, StatStrip, cx } from '../../components/ui.jsx'
import { ChartCard, TimeChart } from '../../components/charts.jsx'
import { BankSelect, useForm, numOrNull, nz } from '../../components/forms.jsx'
import { replayLoan } from '../../lib/amortization.js'
import { inr, inrCompact, monthsToYM } from '../../lib/format.js'
import { dateLabel, monthShort } from '../../lib/dates.js'

export default function Schedule() {
  const { data, derived, today, add, del, skipRow, restoreRow, notify } = useData()
  const loans = derived.activeLoans
  const [id, setId] = useState(loans[0]?.loan.id)
  const cur = loans.find((l) => l.loan.id === id) || loans[0]
  const [showAll, setShowAll] = useState(false)
  const [f, set, setF] = useForm({ date: today, amount: '', bank_account_id: '', note: '' })
  const [open, setOpen] = useState(false)

  const plain = useMemo(() => (cur ? replayLoan(cur.loan, { payments: cur.payments, prepayments: [], today }) : null), [cur, today])
  if (!cur) return <Empty title="No active loans" hint="Add a loan under EMIs to see its amortisation schedule." />
  const { loan, summary: s } = cur

  const rows = s.rows
  const firstFuture = rows.findIndex((r) => r.date > today)
  const shown = showAll ? rows : rows.slice(Math.max(0, (firstFuture < 0 ? rows.length : firstFuture) - 3), (firstFuture < 0 ? rows.length : firstFuture) + 24)

  const chart = (() => {
    const map = new Map()
    const put = (rr, key) => { for (const r of rr.rows) { const m = r.date.slice(0, 7); const e = map.get(m) || { m }; e[key] = Math.round(r.closing); map.set(m, e) } }
    put(s, 'Actual'); if (plain) put(plain, 'Without extra payments')
    return [...map.values()].sort((a, b) => (a.m < b.m ? -1 : 1)).map((e) => ({ ...e, label: `${monthShort(e.m)} ${e.m.slice(2, 4)}`, Actual: e.Actual ?? 0, 'Without extra payments': e['Without extra payments'] ?? 0 }))
  })()
  const showBoth = cur.prepayments.length > 0

  const addPre = async (e) => {
    e.preventDefault()
    const amount = numOrNull(f.amount)
    if (!(amount > 0)) return notify('Enter the extra amount', 'error')
    try { await add('emi_prepayments', { emi_id: loan.id, date: f.date, amount, bank_account_id: f.bank_account_id || null, note: nz(f.note.trim()) }); notify(`Extra payment of ${inr(amount)} recorded - the schedule is shorter`); setF((o) => ({ ...o, amount: '', note: '' })); setOpen(false) } catch { /* toast */ }
  }
  const act = async (fn, msg) => { try { await fn(); notify(msg) } catch { /* toast */ } }

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <Field label="Loan"><Select value={cur.loan.id} onChange={(e) => { setId(e.target.value); setShowAll(false) }}>{loans.map((l) => <option key={l.loan.id} value={l.loan.id}>{l.loan.name}</option>)}</Select></Field>
        <Btn variant="primary" onClick={() => setOpen((v) => !v)}><Plus size={16} />Pay extra</Btn>
      </div>

      {open && (
        <Card title="Record an extra payment">
          <form onSubmit={addPre} className="grid gap-3.5 sm:grid-cols-4">
            <Field label="Amount (₹)"><Input required autoFocus type="number" min="1" step="any" inputMode="decimal" value={f.amount} onChange={set('amount')} className="font-semibold" /></Field>
            <Field label="Date"><Input required type="date" value={f.date} onChange={set('date')} /></Field>
            <BankSelect value={f.bank_account_id} onChange={set('bank_account_id')} label="Paid from" />
            <Field label="Note"><Input value={f.note} onChange={set('note')} placeholder="optional" /></Field>
            <div className="sm:col-span-4 flex flex-wrap items-center gap-3"><Btn variant="primary" type="submit">Save extra payment</Btn><span className="text-[12.5px] text-soft">Your EMI stays the same, so the loan simply ends sooner.</span></div>
          </form>
        </Card>
      )}

      <StatStrip cols={4}>
        <Stat big label="Outstanding today" value={inr(s.balanceToday)} sub={`${(Number(loan.interest_rate)).toFixed(2)}% · EMI ${inr(loan.emi_amount)} on day ${loan.emi_day}`} />
        <Stat label="Last EMI" value={s.closeDate ? dateLabel(s.closeDate) : s.neverCloses ? 'Never' : '—'} sub={s.remainingMonths ? `${monthsToYM(s.remainingMonths)} to go` : undefined} tone={s.neverCloses ? 'neg' : 'neutral'} />
        <Stat label="Interest still to pay" value={inrCompact(s.interestRemaining)} sub={`${inrCompact(s.interestPaid)} paid since the baseline`} />
        <Stat label="Saved by extra payments" value={s.monthsSaved ? `${s.monthsSaved} months` : '—'} sub={s.interestSaved > 0 ? `${inr(s.interestSaved)} less interest · ends ${dateLabel(s.closeDate)} instead of ${dateLabel(s.plainCloseDate)}` : 'add one to see the effect'} tone={s.monthsSaved ? 'pos' : 'neutral'} />
      </StatStrip>

      <ChartCard title="Outstanding balance" subtitle={showBoth ? 'Your path versus paying only the EMI' : undefined}
        table={{ head: ['Month', 'Balance', ...(showBoth ? ['Without extra'] : [])], rows: chart.filter((_, i) => i % Math.max(1, Math.ceil(chart.length / 12)) === 0).map((c) => [c.label, inr(c.Actual), ...(showBoth ? [inr(c['Without extra payments'])] : [])]) }}>
        <TimeChart type={showBoth ? 'line' : 'area'} data={chart} series={showBoth ? [{ key: 'Actual', label: 'With your extra payments' }, { key: 'Without extra payments', label: 'EMI only', color: 'var(--s2)' }] : [{ key: 'Actual', label: 'Outstanding' }]} height={220} />
      </ChartCard>

      <Card pad={false}>
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 pb-1 pt-3.5 md:px-5">
          <h2 className="text-[11.5px] font-semibold uppercase tracking-wider text-muted">Schedule</h2>
          <button className="text-[12.5px] font-medium text-gold underline" onClick={() => setShowAll((v) => !v)}>{showAll ? 'Show upcoming only' : `Show all ${rows.length} rows`}</button>
        </div>
        <div className="scroll-x max-h-[560px] overflow-y-auto px-2 pb-2 md:px-3">
          <table className="w-full min-w-[680px] text-[13px]">
            <thead className="sticky top-0 bg-surface"><tr><th className="th">#</th><th className="th">Date</th><th className="th text-right">Opening</th><th className="th text-right">Interest</th><th className="th text-right">Principal</th><th className="th text-right">Paid</th><th className="th text-right">Closing</th><th className="th">Status</th><th /></tr></thead>
            <tbody>
              {shown.map((r, i) => {
                const pre = r.type === 'prepay'
                const missed = r.type === 'missed'
                const past = r.date <= today
                const isNext = !past && r === s.nextDue
                return (
                  <tr key={`${r.date}-${r.type}-${i}`} className={cx(pre && 'bg-gold-soft/50', missed && 'bg-rust-soft/50', isNext && 'font-medium')}>
                    <td className="td tnum text-muted">{pre ? '+' : r.n}</td>
                    <td className="td whitespace-nowrap">{dateLabel(r.date)}</td>
                    <td className="td tnum text-right text-soft">{inr(r.opening)}</td>
                    <td className="td tnum text-right text-soft">{pre ? '—' : inr(r.interest)}</td>
                    <td className="td tnum text-right text-soft">{missed ? '—' : inr(r.principal)}</td>
                    <td className="td tnum text-right">{pre ? <b className="text-gold">{inr(r.payment)}</b> : missed ? '—' : inr(r.payment)}</td>
                    <td className="td tnum text-right font-medium">{inr(r.closing)}</td>
                    <td className="td whitespace-nowrap">{pre ? <Badge tone="gold">Extra{r.status === 'planned' ? ' · planned' : ''}</Badge> : missed ? <Badge tone="rust">Not debited</Badge> : past ? <Badge tone="sage">Paid · auto</Badge> : isNext ? <Badge tone="gold">Next</Badge> : <Badge>Projected</Badge>}</td>
                    <td className="td whitespace-nowrap text-right">
                      {pre && r.ref && <ConfirmDelete label="Delete" onConfirm={() => act(() => del('emi_prepayments', r.ref), 'Extra payment deleted')} />}
                      {missed && r.ref && <Btn size="sm" variant="ghost" onClick={() => act(() => restoreRow('emi_payments', r.ref), 'EMI restored')}><Undo2 size={14} />Restore</Btn>}
                      {r.type === 'emi' && past && r.ref && <ConfirmDelete label="EMI not debited" confirmLabel="Yes, mark missed" onConfirm={() => act(() => skipRow('emi_payments', r.ref), 'Marked as not debited - interest carries over')} />}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="px-5 pb-4 pt-1 text-[12px] text-muted">Interest is charged monthly on the reducing balance. If a bank charges differently (daily reducing balance, floating-rate resets), match it by updating the outstanding amount from your statement.</p>
      </Card>
    </div>
  )
}
