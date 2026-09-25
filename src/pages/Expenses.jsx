import { useMemo, useState } from 'react'
import { Route, Routes, useNavigate, useSearchParams } from 'react-router-dom'
import { Pencil, Search } from 'lucide-react'
import { useData } from '../ctx/DataContext.jsx'
import { Badge, Btn, Card, ConfirmDelete, Empty, Field, Input, Modal, PageHeader, PersonTag, Select, Stat, StatStrip, Table, Tabs, Textarea } from '../components/ui.jsx'
import { HBars, ChartCard, TimeChart, slot } from '../components/charts.jsx'
import { PaymentFields, PersonSelect, useForm, numOrNull } from '../components/forms.jsx'
import { EXPENSE_CATEGORIES, PAYMENT_METHODS, paymentLabel } from '../lib/constants.js'
import { inr, inrCompact } from '../lib/format.js'
import { dateShort, monthLabel, monthShort, shiftMonth, ym, daysInMonth, parseISO } from '../lib/dates.js'

const TABS = [
  { to: '/expenses', label: 'Dashboard', end: true },
  { to: '/expenses/list', label: 'Transactions' },
  { to: '/expenses/add', label: 'Add expense' },
]

/* ---------- shared form (Add page + edit dialog) ---------- */
export function ExpenseForm({ row, onDone, sticky = false, formId = 'expense-form', hideSubmit }) {
  const { add, edit, people, me, today, notify, data } = useData()
  const [f, set, setF] = useForm({
    date: row?.date || today, person: row?.person || me || people[0] || '', category: row?.category || 'Groceries', note: row?.note || '',
    amount: row?.amount ?? '', payment_method: row?.payment_method || 'bank_upi', bank_account_id: row?.bank_account_id || '', credit_card_id: row?.credit_card_id || '',
  })
  const [saved, setSaved] = useState(0)
  const catList = useMemo(() => { const s = new Set(EXPENSE_CATEGORIES); data.expenses.forEach((e) => s.add(e.category)); return [...s] }, [data.expenses])

  const submit = async (e) => {
    e.preventDefault()
    const amount = numOrNull(f.amount)
    if (!(amount >= 0) || amount === null) return notify('Enter the amount', 'error')
    if (f.payment_method === 'credit_card' && !f.credit_card_id) return notify('Choose which credit card', 'error')
    const body = {
      date: f.date, person: f.person, category: f.category, note: f.note.trim() || null, amount, payment_method: f.payment_method,
      bank_account_id: f.payment_method === 'bank_upi' ? f.bank_account_id || null : null,
      credit_card_id: f.payment_method === 'credit_card' ? f.credit_card_id || null : null,
    }
    try {
      if (row) await edit('expenses', row.id, body); else await add('expenses', body)
      notify(row ? 'Expense updated' : `Saved ${inr(amount)} · ${f.category}`)
      if (row) onDone?.()
      else { setSaved((n) => n + 1); setF((o) => ({ ...o, amount: '', note: '' })); onDone?.() }
    } catch { /* toast shown */ }
  }
  return (
    <form id={formId} onSubmit={submit} className="grid gap-3.5 sm:grid-cols-2">
      <Field label="Amount (₹)"><Input required autoFocus={!row} type="number" min="0" step="0.01" inputMode="decimal" value={f.amount} onChange={set('amount')} className="text-[18px] font-semibold" key={saved} /></Field>
      <Field label="Date"><Input required type="date" max={today} value={f.date} onChange={set('date')} /></Field>
      <Field label="Category"><Select value={f.category} onChange={set('category')}>{catList.map((c) => <option key={c}>{c}</option>)}</Select></Field>
      <PersonSelect label="Spent by" value={f.person} onChange={set('person')} />
      <PaymentFields f={f} set={set} />
      <Field label="Note" className="sm:col-span-2"><Textarea value={f.note} onChange={set('note')} placeholder="What was it for? (optional)" /></Field>
      {!hideSubmit && <div className="sm:col-span-2"><Btn type="submit" variant="primary" className="w-full sm:w-auto">{row ? 'Save changes' : 'Save expense'}</Btn></div>}
    </form>
  )
}

function EditDialog({ row, onClose }) {
  return (
    <Modal open onClose={onClose} title="Edit expense" footer={<><Btn onClick={onClose}>Cancel</Btn><Btn variant="primary" type="submit" form="edit-expense">Save</Btn></>}>
      <ExpenseForm row={row} onDone={onClose} formId="edit-expense" hideSubmit />
    </Modal>
  )
}

/* ---------- dashboard ---------- */
const PERIODS = [
  { v: 'm0', label: 'This month' }, { v: 'm1', label: 'Last month' }, { v: 'm3', label: 'Last 3 months' }, { v: 'm12', label: 'Last 12 months' },
]
function periodRange(v, today) {
  const cur = ym(today)
  const first = (m) => `${m}-01`
  const last = (m) => `${m}-${String(daysInMonth(...m.split('-').map(Number))).padStart(2, '0')}`
  if (v === 'm1') { const m = shiftMonth(cur, -1); return { from: first(m), to: last(m), months: 1, prev: shiftMonth(cur, -2) } }
  if (v === 'm3') return { from: first(shiftMonth(cur, -2)), to: today, months: 3 }
  if (v === 'm12') return { from: first(shiftMonth(cur, -11)), to: today, months: 12 }
  return { from: first(cur), to: today, months: 1, prev: shiftMonth(cur, -1) }
}
const sumBy = (rows, keyFn) => {
  const m = new Map()
  for (const r of rows) { const k = keyFn(r); m.set(k, (m.get(k) || 0) + Number(r.amount)) }
  return [...m.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)
}

function Dashboard() {
  const { data, derived, today, owners } = useData()
  const nav = useNavigate()
  const [period, setPeriod] = useState('m0')
  const r = periodRange(period, today)
  const rows = data.expenses.filter((e) => e.date >= r.from && e.date <= r.to)
  const total = rows.reduce((s, e) => s + Number(e.amount), 0)
  const byCat = sumBy(rows, (e) => e.category)
  const byMethod = sumBy(rows, (e) => paymentLabel(e.payment_method))
  const byPerson = sumBy(rows, (e) => e.person)
  const byCard = sumBy(rows.filter((e) => e.credit_card_id), (e) => derived.maps.card[e.credit_card_id]?.name || 'Card')
  const byBank = sumBy(rows.filter((e) => e.bank_account_id), (e) => derived.maps.bank[e.bank_account_id]?.name || 'Account')
  const trend = derived.cashflow.map((c) => ({ label: monthShort(c.month), Spending: Math.round(c.expenses), month: c.month }))
  const dayCount = period === 'm0' ? parseISO(today).d : period === 'm1' ? daysInMonth(...shiftMonth(ym(today), -1).split('-').map(Number)) : Math.max(1, Math.round((Date.parse(r.to) - Date.parse(r.from)) / 864e5) + 1)
  const prevTotal = r.prev ? data.expenses.filter((e) => e.date.slice(0, 7) === r.prev && (period !== 'm0' || parseISO(e.date).d <= parseISO(today).d)).reduce((s, e) => s + Number(e.amount), 0) : null
  const delta = prevTotal ? ((total - prevTotal) / prevTotal) * 100 : null
  const goList = (k, v) => nav(`/expenses/list?${k}=${encodeURIComponent(v)}&p=${period}`)
  const biggest = [...rows].sort((a, b) => b.amount - a.amount).slice(0, 5)

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Select className="!w-auto" value={period} onChange={(e) => setPeriod(e.target.value)} aria-label="Period">{PERIODS.map((p) => <option key={p.v} value={p.v}>{p.label}</option>)}</Select>
      </div>
      <StatStrip cols={4}>
        <Stat label="Total spent" value={inr(total)} sub={delta == null ? `${rows.length} transactions` : `${delta >= 0 ? '▲' : '▼'} ${Math.abs(delta).toFixed(0)}% vs ${period === 'm0' ? 'same days last month' : 'the month before'}`} tone={delta > 10 ? 'neg' : 'neutral'} big />
        <Stat label="Per day" value={inr(total / dayCount)} sub={`over ${dayCount} days`} />
        <Stat label="Top category" value={byCat[0]?.name || '—'} sub={byCat[0] ? `${inr(byCat[0].value)} · ${Math.round((byCat[0].value / total) * 100)}%` : undefined} />
        <Stat label="On credit cards" value={inr(rows.filter((e) => e.payment_method === 'credit_card').reduce((s, e) => s + Number(e.amount), 0))} sub="settle by the due date" />
      </StatStrip>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Spending by month" className="lg:col-span-2" table={{ head: ['Month', 'Spent'], rows: trend.map((t) => [monthLabel(t.month), inr(t.Spending)]) }}>
          <TimeChart type="bar" data={trend} series={[{ key: 'Spending', label: 'Spending' }]} height={200} />
        </ChartCard>
        <Card title="By category"><HBars items={byCat} showShare onClick={(i) => goList('category', i.name)} empty="No expenses in this period." /></Card>
        <Card title="By payment method">
          <HBars items={byMethod} colorOf={(it) => slot(Math.max(PAYMENT_METHODS.findIndex((m) => m.short === it.name), 0))} showShare />
          {byCard.length > 0 && <><h3 className="mb-2.5 mt-5 text-[11.5px] font-semibold uppercase tracking-wider text-muted">Credit cards</h3><HBars items={byCard} color="var(--s2)" /></>}
          {byBank.length > 0 && <><h3 className="mb-2.5 mt-5 text-[11.5px] font-semibold uppercase tracking-wider text-muted">Bank / UPI accounts</h3><HBars items={byBank} color="var(--s3)" /></>}
        </Card>
        <Card title="Who spent"><HBars items={byPerson} colorOf={(it) => slot(Math.max(owners.indexOf(it.name), 0))} showShare /></Card>
        <Card title="Biggest expenses">
          {biggest.length === 0 ? <p className="py-6 text-center text-[13px] text-muted">Nothing yet.</p> : (
            <ul className="divide-y divide-line">
              {biggest.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0"><div className="truncate text-[13.5px]">{e.note || e.category}</div><div className="text-[12px] text-muted">{dateShort(e.date)} · {e.category} · {e.person}</div></div>
                  <div className="tnum text-[13.5px] font-medium">{inr(e.amount)}</div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  )
}

/* ---------- transactions list ---------- */
function List() {
  const { data, derived, del, notify, today, people } = useData()
  const [sp, setSp] = useSearchParams()
  const [edit, setEdit] = useState(null)
  const [q, setQ] = useState('')
  const f = { p: sp.get('p') || 'm0', category: sp.get('category') || '', person: sp.get('person') || '', method: sp.get('method') || '' }
  const setF = (k, v) => { const n = new URLSearchParams(sp); v ? n.set(k, v) : n.delete(k); setSp(n, { replace: true }) }
  const r = periodRange(f.p, today)
  const rows = data.expenses
    .filter((e) => e.date >= r.from && e.date <= r.to && (!f.category || e.category === f.category) && (!f.person || e.person === f.person) && (!f.method || e.payment_method === f.method)
      && (!q || `${e.note || ''} ${e.category}`.toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (a.created_at || '') < (b.created_at || '') ? 1 : -1))
  const total = rows.reduce((s, e) => s + Number(e.amount), 0)
  const cats = [...new Set(data.expenses.map((e) => e.category))].sort()
  const via = (e) => e.payment_method === 'credit_card' ? derived.maps.card[e.credit_card_id]?.name || 'Credit card' : e.payment_method === 'bank_upi' ? derived.maps.bank[e.bank_account_id]?.name || 'Bank / UPI' : paymentLabel(e.payment_method)

  return (
    <>
      <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <Select value={f.p} onChange={(e) => setF('p', e.target.value)} aria-label="Period">{PERIODS.map((p) => <option key={p.v} value={p.v}>{p.label}</option>)}</Select>
        <Select value={f.category} onChange={(e) => setF('category', e.target.value)} aria-label="Category"><option value="">All categories</option>{cats.map((c) => <option key={c}>{c}</option>)}</Select>
        <Select value={f.person} onChange={(e) => setF('person', e.target.value)} aria-label="Person"><option value="">Everyone</option>{people.map((p) => <option key={p}>{p}</option>)}</Select>
        <Select value={f.method} onChange={(e) => setF('method', e.target.value)} aria-label="Payment method"><option value="">All payment methods</option>{PAYMENT_METHODS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</Select>
        <div className="relative"><Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" /><Input className="pl-9" placeholder="Search notes" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      </div>
      <Card pad={false}>
        <div className="flex items-center justify-between px-4 pb-1 pt-3.5 text-[13px] text-soft md:px-5"><span>{rows.length} transactions</span><span className="tnum font-semibold text-ink">{inr(total)}</span></div>
        {rows.length === 0 ? <div className="p-4"><Empty title="No expenses match" hint="Change the filters or add one." /></div> : (
          <>
            <ul className="divide-y divide-line px-4 pb-2 md:hidden">
              {rows.slice(0, 400).map((e) => (
                <li key={e.id} className="flex items-start justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <div className="truncate text-[14px] font-medium">{e.note || e.category}</div>
                    <div className="mt-0.5 text-[12px] leading-snug text-muted">{dateShort(e.date)} · {e.category} · {via(e)}{e.person ? ` · ${e.person}` : ''}</div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="tnum text-[14px] font-semibold">{inr(e.amount)}</div>
                    <div className="-mr-2 mt-0.5 flex justify-end"><Btn size="sm" variant="ghost" aria-label="Edit expense" onClick={() => setEdit(e)}><Pencil size={14} /></Btn><ConfirmDelete label="Delete" onConfirm={async () => { try { await del('expenses', e.id); notify('Expense deleted') } catch { /* toast */ } }} /></div>
                  </div>
                </li>
              ))}
            </ul>
            <div className="hidden md:block">
          <Table head={['Date', 'Category', 'Note', 'Paid via', 'By', { label: 'Amount', right: true }, '']} className="px-2 pb-2" stack={false}>
              {rows.slice(0, 400).map((e) => (
                <tr key={e.id}>
                  <td className="td whitespace-nowrap text-soft">{dateShort(e.date)}</td>
                  <td className="td"><Badge>{e.category}</Badge></td>
                  <td className="td max-w-[220px] truncate text-soft">{e.note || '—'}</td>
                  <td className="td whitespace-nowrap text-soft">{via(e)}</td>
                  <td className="td"><PersonTag name={e.person} /></td>
                  <td className="td tnum text-right font-medium">{inr(e.amount)}</td>
                  <td className="td whitespace-nowrap text-right"><Btn size="sm" variant="ghost" aria-label="Edit expense" onClick={() => setEdit(e)}><Pencil size={14} /></Btn><ConfirmDelete label="Delete" onConfirm={async () => { try { await del('expenses', e.id); notify('Expense deleted') } catch { /* toast */ } }} /></td>
                </tr>
              ))}
            </Table>
            </div>
          </>
        )}
        {rows.length > 400 && <p className="px-5 pb-4 text-[12px] text-muted">Showing the latest 400 - narrow the filters to see the rest.</p>}
      </Card>
      {edit && <EditDialog row={edit} onClose={() => setEdit(null)} />}
    </>
  )
}

/* ---------- add page ---------- */
function Add() {
  const { data, derived } = useData()
  const recent = [...data.expenses].sort((a, b) => ((a.created_at || a.date) < (b.created_at || b.date) ? 1 : -1)).slice(0, 5)
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
      <Card title="New expense"><ExpenseForm sticky /></Card>
      <Card title="Just added">
        {recent.length === 0 ? <p className="py-6 text-center text-[13px] text-muted">Your latest entries appear here.</p> : (
          <ul className="divide-y divide-line">
            {recent.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0"><div className="truncate text-[13.5px]">{e.note || e.category}</div><div className="text-[12px] text-muted">{dateShort(e.date)} · {paymentLabel(e.payment_method)}{e.credit_card_id ? ` · ${derived.maps.card[e.credit_card_id]?.name || ''}` : e.bank_account_id ? ` · ${derived.maps.bank[e.bank_account_id]?.name || ''}` : ''}</div></div>
                <div className="tnum text-[13.5px] font-medium">{inr(e.amount)}</div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}

export default function Expenses() {
  return (
    <>
      <PageHeader title="Expenses" subtitle="Every payment, by method, card and account." />
      <Tabs items={TABS} />
      <Routes>
        <Route index element={<Dashboard />} />
        <Route path="list" element={<List />} />
        <Route path="add" element={<Add />} />
      </Routes>
    </>
  )
}
