import { useMemo, useState } from 'react'
import { Route, Routes, useNavigate, useSearchParams } from 'react-router-dom'
import { Pencil, Plus, Repeat, Search, Trash2 } from 'lucide-react'
import { useData } from '../ctx/DataContext.jsx'
import Import from './expenses/Import.jsx'
import { Badge, Btn, Card, ConfirmDelete, Empty, Field, Input, Modal, PageHeader, PersonTag, Segmented, Select, Stat, StatStrip, Table, Tabs, Textarea } from '../components/ui.jsx'
import { HBars, ChartCard, Donut, TimeChart, slot } from '../components/charts.jsx'
import { BankSelect, CardSelect, ChannelVendorFields, PaymentFields, PersonSelect, useForm, numOrNull } from '../components/forms.jsx'
import { EXPENSE_CATEGORIES, PAYMENT_CARD_KIND, PAYMENT_METHODS, channelLabel, isCardPayment, paymentLabel } from '../lib/constants.js'
import { inr } from '../lib/format.js'
import { addDaysISO, addMonthsISO, dateShort, lastMonths, monthLabel, monthShort, shiftMonth, ym, daysInMonth, parseISO } from '../lib/dates.js'

const TABS = [
  { to: '/expenses', label: 'Dashboard', end: true },
  { to: '/expenses/list', label: 'Transactions' },
  { to: '/expenses/add', label: 'Add expense' },
  { to: '/expenses/import', label: 'Import statement' },
]
const catColor = (name) => slot(Math.max(EXPENSE_CATEGORIES.indexOf(name), 0))

/* ---------- shared form (Add page + edit dialog) ---------- */
export function ExpenseForm({ row, onDone, sticky = false, formId = 'expense-form', hideSubmit }) {
  const { add, edit, addMany, people, me, today, notify, data } = useData()
  const [f, set, setF] = useForm({
    date: row?.date || today, person: row?.person || me || people[0] || '', category: row?.category || 'Groceries', note: row?.note || '',
    amount: row?.amount ?? '', payment_method: row?.payment_method || 'bank_upi', bank_account_id: row?.bank_account_id || '', credit_card_id: row?.credit_card_id || '',
    channel: row?.channel || '', vendor: row?.vendor || '', settles_card_id: row?.settles_card_id || '',
  })
  const [saved, setSaved] = useState(0)
  const [repeat, setRepeat] = useState(false)
  const [repeatFreq, setRepeatFreq] = useState('monthly')
  const [repeatCount, setRepeatCount] = useState(3)
  const [repeatVary, setRepeatVary] = useState(false)
  const [repeatAmounts, setRepeatAmounts] = useState([])
  const catList = useMemo(() => { const s = new Set(EXPENSE_CATEGORIES); data.expenses.forEach((e) => s.add(e.category)); return [...s] }, [data.expenses])
  const isSettlement = f.category === 'Credit Card Payment'

  const submit = async (e) => {
    e.preventDefault()
    const amount = numOrNull(f.amount)
    if (!(amount >= 0) || amount === null) return notify('Enter the amount', 'error')
    if (f.payment_method === 'credit_card' && !f.credit_card_id) return notify('Choose which credit card', 'error')
    if (isSettlement && !f.settles_card_id) return notify('Choose which card this payment settles', 'error')
    const base = {
      person: f.person, category: f.category, note: f.note.trim() || null, payment_method: f.payment_method,
      bank_account_id: f.payment_method === 'bank_upi' ? f.bank_account_id || null : null,
      credit_card_id: isCardPayment(f.payment_method) ? f.credit_card_id || null : null,
      channel: f.channel || null, vendor: f.vendor.trim() || null,
      settles_card_id: isSettlement ? f.settles_card_id || null : null,
    }
    try {
      if (row) {
        await edit('expenses', row.id, { ...base, date: f.date, amount })
        notify('Expense updated'); onDone?.()
      } else if (repeat && repeatCount > 1) {
        const dates = Array.from({ length: repeatCount }, (_, i) => (i === 0 ? f.date : repeatFreq === 'weekly' ? addDaysISO(f.date, 7 * i) : addMonthsISO(f.date, i)))
        const amounts = Array.from({ length: repeatCount }, (_, i) => (i === 0 || !repeatVary ? amount : numOrNull(repeatAmounts[i - 1]) ?? amount))
        await addMany('expenses', dates.map((d, i) => ({ ...base, date: d, amount: amounts[i] })))
        notify(`Saved ${repeatCount} expenses · ${f.category}`)
        setSaved((n) => n + 1); setF((o) => ({ ...o, amount: '', note: '' })); setRepeat(false); setRepeatAmounts([]); onDone?.()
      } else {
        await add('expenses', { ...base, date: f.date, amount })
        notify(`Saved ${inr(amount)} · ${f.category}`)
        setSaved((n) => n + 1); setF((o) => ({ ...o, amount: '', note: '' })); onDone?.()
      }
    } catch { /* toast shown */ }
  }
  return (
    <form id={formId} onSubmit={submit} className="grid gap-3.5 sm:grid-cols-2">
      <Field label="Amount (₹)"><Input required autoFocus={!row} type="number" min="0" step="0.01" inputMode="decimal" value={f.amount} onChange={set('amount')} className="text-[18px] font-semibold" key={saved} /></Field>
      <Field label="Date"><Input required type="date" max={today} value={f.date} onChange={set('date')} /></Field>
      <Field label="Category"><Select value={f.category} onChange={set('category')}>{catList.map((c) => <option key={c}>{c}</option>)}</Select></Field>
      <PersonSelect label="Spent by" value={f.person} onChange={set('person')} />
      <PaymentFields f={f} set={set} />
      {isSettlement && <CardSelect value={f.settles_card_id} onChange={set('settles_card_id')} label="Paying off which card" kind="credit" required />}
      <ChannelVendorFields f={f} set={set} listId={`${formId}-vendors`} />
      <Field label="Note" className="sm:col-span-2"><Textarea value={f.note} onChange={set('note')} placeholder="What was it for? (optional)" /></Field>
      {!row && (
        <div className="rounded-lg border border-line bg-sunken/60 p-3 sm:col-span-2">
          <label className="flex items-center gap-2 text-[13px] font-medium"><input type="checkbox" checked={repeat} onChange={(e) => setRepeat(e.target.checked)} className="h-4 w-4 accent-[var(--gold-fill)]" /><Repeat size={14} />Repeat this transaction</label>
          {repeat && (
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <Field label="Every"><Select value={repeatFreq} onChange={(e) => setRepeatFreq(e.target.value)}><option value="monthly">Month</option><option value="weekly">Week</option></Select></Field>
              <Field label="Number of times" hint="including this one">
                <Input type="number" min="2" max="24" value={repeatCount} onChange={(e) => setRepeatCount(Math.min(24, Math.max(2, Number(e.target.value) || 2)))} />
              </Field>
              <label className="flex items-center gap-2 self-end pb-2 text-[13px]"><input type="checkbox" checked={repeatVary} onChange={(e) => setRepeatVary(e.target.checked)} className="h-4 w-4 accent-[var(--gold-fill)]" />Different amount each time</label>
              {repeatVary && (
                <div className="grid grid-cols-2 gap-2 sm:col-span-3 sm:grid-cols-4">
                  {Array.from({ length: repeatCount - 1 }).map((_, i) => (
                    <Field key={i} label={`Occurrence ${i + 2}`}>
                      <Input type="number" min="0" step="0.01" value={repeatAmounts[i] ?? ''} placeholder={f.amount || '0'}
                        onChange={(e) => setRepeatAmounts((a) => { const n = [...a]; n[i] = e.target.value; return n })} />
                    </Field>
                  ))}
                </div>
              )}
              <p className="text-[11.5px] text-muted sm:col-span-3">{repeatCount} expenses will be added, {repeatFreq === 'weekly' ? 'one every week' : 'one every month'} starting {f.date}.</p>
            </div>
          )}
        </div>
      )}
      {!hideSubmit && <div className="sm:col-span-2"><Btn type="submit" variant="primary" className="w-full sm:w-auto">{row ? 'Save changes' : repeat ? `Save ${repeatCount} expenses` : 'Save expense'}</Btn></div>}
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

/* ---------- add multiple transactions in one go ---------- */
const blankBulkRow = () => ({ category: 'Groceries', amount: '', note: '' })
function BulkAddForm({ onDone }) {
  const { addMany, people, me, today, notify, data } = useData()
  const [common, setCommon] = useState({ date: today, person: me || people[0] || '', payment_method: 'bank_upi', bank_account_id: '', credit_card_id: '' })
  const [rows, setRows] = useState([blankBulkRow(), blankBulkRow()])
  const catList = useMemo(() => { const s = new Set(EXPENSE_CATEGORIES); data.expenses.forEach((e) => s.add(e.category)); return [...s] }, [data.expenses])
  const setCommonField = (k) => (e) => setCommon((o) => ({ ...o, [k]: e.target.value }))
  const setRow = (i, k) => (e) => setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, [k]: e.target.value } : r)))
  const total = rows.reduce((s, r) => s + (numOrNull(r.amount) || 0), 0)

  const submit = async (e) => {
    e.preventDefault()
    if (common.payment_method === 'credit_card' && !common.credit_card_id) return notify('Choose which credit card', 'error')
    const valid = rows.filter((r) => numOrNull(r.amount) > 0)
    if (!valid.length) return notify('Enter at least one amount', 'error')
    const body = valid.map((r) => ({
      date: common.date, person: common.person, category: r.category, note: r.note.trim() || null, amount: numOrNull(r.amount),
      payment_method: common.payment_method,
      bank_account_id: common.payment_method === 'bank_upi' ? common.bank_account_id || null : null,
      credit_card_id: isCardPayment(common.payment_method) ? common.credit_card_id || null : null,
    }))
    try { await addMany('expenses', body); notify(`Saved ${body.length} expenses · ${inr(body.reduce((s, r) => s + r.amount, 0))}`); setRows([blankBulkRow(), blankBulkRow()]); onDone?.() } catch { /* toast */ }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
        <Field label="Date"><Input required type="date" max={today} value={common.date} onChange={setCommonField('date')} /></Field>
        <PersonSelect label="Spent by" value={common.person} onChange={setCommonField('person')} />
        <Field label="Paid with"><Select value={common.payment_method} onChange={setCommonField('payment_method')}>{PAYMENT_METHODS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</Select></Field>
        {common.payment_method === 'bank_upi' && <BankSelect value={common.bank_account_id} onChange={setCommonField('bank_account_id')} label="From account" />}
        {isCardPayment(common.payment_method) && <CardSelect value={common.credit_card_id} onChange={setCommonField('credit_card_id')} kind={PAYMENT_CARD_KIND[common.payment_method]} required={common.payment_method === 'credit_card'} />}
      </div>
      <p className="text-[12px] text-muted">Same date, person and payment method for every row below - just fill in each transaction's category and amount.</p>
      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={i} className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,0.9fr)_minmax(0,1.6fr)_auto] items-end gap-2 rounded-lg border border-line p-2.5">
            <Field label={`#${i + 1} Category`}><Select value={r.category} onChange={setRow(i, 'category')}>{catList.map((c) => <option key={c}>{c}</option>)}</Select></Field>
            <Field label="Amount (₹)"><Input type="number" min="0" step="0.01" inputMode="decimal" value={r.amount} onChange={setRow(i, 'amount')} /></Field>
            <Field label="Note"><Input value={r.note} onChange={setRow(i, 'note')} placeholder="optional" /></Field>
            <Btn variant="ghost" size="sm" type="button" aria-label="Remove row" onClick={() => setRows((rs) => rs.filter((_, idx) => idx !== i))} disabled={rows.length <= 1}><Trash2 size={14} /></Btn>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Btn type="button" onClick={() => setRows((rs) => [...rs, blankBulkRow()])}><Plus size={15} />Add another row</Btn>
        <div className="text-[13px] text-soft">Total <span className="tnum font-semibold text-ink">{inr(total)}</span></div>
      </div>
      <Btn type="submit" variant="primary" className="w-full sm:w-auto">Save all expenses</Btn>
    </form>
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
const isSpend = (e) => e.category !== 'Credit Card Payment'

function Dashboard() {
  const { data, derived, today, owners } = useData()
  const nav = useNavigate()
  const [period, setPeriod] = useState('m0')
  const r = periodRange(period, today)
  const allRows = data.expenses.filter((e) => e.date >= r.from && e.date <= r.to)
  const rows = allRows.filter(isSpend)
  const cardPayments = allRows.filter((e) => !isSpend(e))
  const total = rows.reduce((s, e) => s + Number(e.amount), 0)
  const byCat = sumBy(rows, (e) => e.category)
  const byMethod = sumBy(rows, (e) => paymentLabel(e.payment_method))
  const byPerson = sumBy(rows, (e) => e.person)
  const byCard = sumBy(rows.filter((e) => e.credit_card_id), (e) => derived.maps.card[e.credit_card_id]?.name || 'Card')
  const byBank = sumBy(rows.filter((e) => e.bank_account_id), (e) => derived.maps.bank[e.bank_account_id]?.name || 'Account')
  const byChannel = sumBy(rows.filter((e) => e.channel), (e) => channelLabel(e.channel))

  // Stacked bar: last 6 months, top categories (the rest fold into "Other categories" so the chart stays readable)
  const stackMonths = lastMonths(ym(today), 6)
  const catTotalsAll = {}
  for (const e of data.expenses) { if (!isSpend(e) || !stackMonths.includes(e.date.slice(0, 7))) continue; catTotalsAll[e.category] = (catTotalsAll[e.category] || 0) + Number(e.amount) }
  const topCats = Object.entries(catTotalsAll).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([c]) => c)
  const stackData = stackMonths.map((m) => {
    const row = { label: monthShort(m), month: m }
    for (const e of data.expenses) {
      if (!isSpend(e) || e.date.slice(0, 7) !== m) continue
      const key = topCats.includes(e.category) ? e.category : 'Other categories'
      row[key] = (row[key] || 0) + Number(e.amount)
    }
    return row
  })
  const hasOther = stackData.some((r2) => r2['Other categories'] > 0)
  const stackSeries = [...topCats.map((c) => ({ key: c, label: c, color: catColor(c) })), ...(hasOther ? [{ key: 'Other categories', label: 'Other categories', color: 'var(--s8)' }] : [])]

  const dayCount = period === 'm0' ? parseISO(today).d : period === 'm1' ? daysInMonth(...shiftMonth(ym(today), -1).split('-').map(Number)) : Math.max(1, Math.round((Date.parse(r.to) - Date.parse(r.from)) / 864e5) + 1)
  const prevTotal = r.prev ? data.expenses.filter((e) => isSpend(e) && e.date.slice(0, 7) === r.prev && (period !== 'm0' || parseISO(e.date).d <= parseISO(today).d)).reduce((s, e) => s + Number(e.amount), 0) : null
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
        <Stat label="On credit cards" value={inr(rows.filter((e) => e.payment_method === 'credit_card').reduce((s, e) => s + Number(e.amount), 0))} sub={cardPayments.length ? `+ ${inr(cardPayments.reduce((s, e) => s + Number(e.amount), 0))} card bills paid` : 'settle by the due date'} />
      </StatStrip>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Spending by month" subtitle="Last 6 months, by category" className="lg:col-span-2"
          table={{ head: ['Month', ...stackSeries.map((s) => s.label)], rows: stackData.map((d) => [monthLabel(d.month), ...stackSeries.map((s) => inr(d[s.key] || 0))]) }}>
          <TimeChart type="bar" data={stackData} series={stackSeries} height={230} />
        </ChartCard>
        <Card title="By category"><Donut items={byCat} colorOf={(it) => catColor(it.name)} onClick={(it) => goList('category', it.name)} /></Card>
        <Card title="By payment method">
          <HBars items={byMethod} colorOf={(it) => slot(Math.max(PAYMENT_METHODS.findIndex((m) => m.short === it.name), 0))} showShare />
          {byCard.length > 0 && <><h3 className="mb-2.5 mt-5 text-[11.5px] font-semibold uppercase tracking-wider text-muted">Credit cards</h3><HBars items={byCard} color="var(--s2)" /></>}
          {byBank.length > 0 && <><h3 className="mb-2.5 mt-5 text-[11.5px] font-semibold uppercase tracking-wider text-muted">Bank / UPI accounts</h3><HBars items={byBank} color="var(--s3)" /></>}
        </Card>
        <Card title="Who spent"><HBars items={byPerson} colorOf={(it) => slot(Math.max(owners.indexOf(it.name), 0))} showShare /></Card>
        {byChannel.length > 0 && <Card title="Online vs physical"><Donut items={byChannel} colorOf={(it) => (it.name === channelLabel('online') ? 'var(--s1)' : 'var(--s5)')} /></Card>}
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
  const f = { p: sp.get('p') || 'm0', category: sp.get('category') || '', person: sp.get('person') || '', method: sp.get('method') || '', channel: sp.get('channel') || '' }
  const setF = (k, v) => { const n = new URLSearchParams(sp); v ? n.set(k, v) : n.delete(k); setSp(n, { replace: true }) }
  const r = periodRange(f.p, today)
  const rows = data.expenses
    .filter((e) => e.date >= r.from && e.date <= r.to && (!f.category || e.category === f.category) && (!f.person || e.person === f.person) && (!f.method || e.payment_method === f.method) && (!f.channel || e.channel === f.channel)
      && (!q || `${e.note || ''} ${e.category} ${e.vendor || ''}`.toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (a.created_at || '') < (b.created_at || '') ? 1 : -1))
  const total = rows.reduce((s, e) => s + Number(e.amount), 0)
  const cats = [...new Set(data.expenses.map((e) => e.category))].sort()
  const via = (e) => e.payment_method === 'credit_card' ? derived.maps.card[e.credit_card_id]?.name || 'Credit card' : isCardPayment(e.payment_method) ? derived.maps.card[e.credit_card_id]?.name || paymentLabel(e.payment_method) : e.payment_method === 'bank_upi' ? derived.maps.bank[e.bank_account_id]?.name || 'Bank / UPI' : paymentLabel(e.payment_method)
  const extra = (e) => [e.vendor, e.settles_card_id ? `→ ${derived.maps.card[e.settles_card_id]?.name || 'card'}` : null].filter(Boolean).join(' · ')

  return (
    <>
      <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
        <Select value={f.p} onChange={(e) => setF('p', e.target.value)} aria-label="Period">{PERIODS.map((p) => <option key={p.v} value={p.v}>{p.label}</option>)}</Select>
        <Select value={f.category} onChange={(e) => setF('category', e.target.value)} aria-label="Category"><option value="">All categories</option>{cats.map((c) => <option key={c}>{c}</option>)}</Select>
        <Select value={f.person} onChange={(e) => setF('person', e.target.value)} aria-label="Person"><option value="">Everyone</option>{people.map((p) => <option key={p}>{p}</option>)}</Select>
        <Select value={f.method} onChange={(e) => setF('method', e.target.value)} aria-label="Payment method"><option value="">All payment methods</option>{PAYMENT_METHODS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</Select>
        <Select value={f.channel} onChange={(e) => setF('channel', e.target.value)} aria-label="Purchase type"><option value="">Online + physical</option><option value="online">{channelLabel('online')}</option><option value="physical">{channelLabel('physical')}</option></Select>
        <div className="relative"><Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" /><Input className="pl-9" placeholder="Search notes / vendor" value={q} onChange={(e) => setQ(e.target.value)} /></div>
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
                    <div className="mt-0.5 text-[12px] leading-snug text-muted">{dateShort(e.date)} · {e.category} · {via(e)}{e.person ? ` · ${e.person}` : ''}{extra(e) ? ` · ${extra(e)}` : ''}</div>
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
                  <td className="td max-w-[220px] truncate text-soft">{e.note || '—'}{e.vendor ? <span className="text-muted"> · {e.vendor}</span> : ''}</td>
                  <td className="td whitespace-nowrap text-soft">{via(e)}{e.settles_card_id ? <span className="text-muted"> → {derived.maps.card[e.settles_card_id]?.name || 'card'}</span> : ''}</td>
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
  const [mode, setMode] = useState('single')
  const recent = [...data.expenses].sort((a, b) => ((a.created_at || a.date) < (b.created_at || b.date) ? 1 : -1)).slice(0, 5)
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
      <Card title="New expense" action={<Segmented value={mode} onChange={setMode} options={[{ value: 'single', label: 'One' }, { value: 'bulk', label: 'Several at once' }]} />}>
        {mode === 'single' ? <ExpenseForm sticky /> : <BulkAddForm />}
      </Card>
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
        <Route path="import" element={<Import />} />
      </Routes>
    </>
  )
}
