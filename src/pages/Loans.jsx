import { Link, Route, Routes } from 'react-router-dom'
import { useData } from '../ctx/DataContext.jsx'
import { Badge, Card, Empty, PageHeader, Progress, Stat, StatStrip, Tabs } from '../components/ui.jsx'
import { ChartCard, TimeChart, slot } from '../components/charts.jsx'
import Emis from './loans/Emis.jsx'
import Schedule from './loans/Schedule.jsx'
import Optimizer from './loans/Optimizer.jsx'
import { optimiserLoans } from './loans/shared.js'
import { simulatePlan } from '../lib/loans.js'
import { inr, inrCompact, pct, monthsToYM } from '../lib/format.js'
import { dateLabel, monthShort, monthYear } from '../lib/dates.js'

const TABS = [
  { to: '/loans', label: 'Dashboard', end: true },
  { to: '/loans/emis', label: 'EMIs' },
  { to: '/loans/schedule', label: 'Schedule' },
  { to: '/loans/optimize', label: 'Clear loans faster' },
]

function Dashboard() {
  const { data, derived, today } = useData()
  const active = derived.activeLoans
  if (!active.length) return <Empty title="No active loans" hint="Add a loan once and EMIs are deducted on their date automatically." action={<Link className="btn btn-primary" to="/loans/emis">Add a loan</Link>} />

  const lo = optimiserLoans(derived)
  const base = simulatePlan(lo, { order: 'baseline', startISO: today })
  const lastClose = active.reduce((m, l) => (l.summary.closeDate && l.summary.closeDate > m ? l.summary.closeDate : m), '')
  const interestLeft = active.reduce((s, l) => s + l.summary.interestRemaining, 0)
  const incomeMonths = derived.cashflow.filter((c) => c.income > 0).slice(-3)
  const avgIncome = incomeMonths.length ? incomeMonths.reduce((s, c) => s + c.income, 0) / incomeMonths.length : 0
  const ratio = avgIncome > 0 ? (derived.monthlyEmi / avgIncome) * 100 : null
  const order = data.emi_master.map((l) => l.id)

  // stacked balance by loan
  const n = Math.min(base.months === Infinity ? 360 : base.months, 360)
  const chart = base.timeline.slice(0, n + 1).map((t) => {
    const row = { label: `${monthShort(t.date.slice(0, 7))} ${t.date.slice(2, 4)}` }
    lo.forEach((l) => { row[l.name] = Math.round(t.balances[l.id] || 0) })
    return row
  }).filter((_, i, arr) => i % Math.max(1, Math.ceil(arr.length / 60)) === 0)

  return (
    <>
      <StatStrip cols={4}>
        <Stat big label="Loans outstanding" value={inr(derived.debt)} sub={`${active.length} active loan${active.length > 1 ? 's' : ''}`} tone="neg" />
        <Stat label="EMIs per month" value={inr(derived.monthlyEmi)} sub={ratio != null ? `${ratio.toFixed(0)}% of income${ratio > 40 ? ' - above the 40% comfort line' : ''}` : 'log income to see the share'} tone={ratio > 40 ? 'neg' : 'neutral'} />
        <Stat label="Debt-free by" value={lastClose ? monthYear(lastClose) : '—'} sub={base.done ? `${monthsToYM(base.months)} at current EMIs` : undefined} />
        <Stat label="Interest still to pay" value={inrCompact(interestLeft)} sub="if you only pay EMIs" />
      </StatStrip>

      <div className="mb-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {active.map((l) => {
          const s = l.summary
          const principal = Number(l.loan.principal)
          const paidPct = principal > 0 ? Math.max(0, Math.min(100, ((principal - s.balanceToday) / principal) * 100)) : 0
          return (
            <Card key={l.loan.id}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0"><h3 className="truncate text-[15px] font-semibold">{l.loan.name}</h3><p className="text-[12.5px] text-soft">{l.loan.loan_type} · {pct(l.loan.interest_rate, 2)}{l.loan.person ? ` · ${l.loan.person}` : ''}</p></div>
                {s.monthsSaved > 0 && <Badge tone="sage">{s.monthsSaved} mo saved</Badge>}
              </div>
              <div className="mt-3 text-[22px] font-semibold tracking-tight tnum">{inr(s.balanceToday)}</div>
              <div className="mt-2"><Progress value={paidPct} tone="sage" /></div>
              <div className="mt-1.5 flex justify-between text-[12px] text-soft"><span>{pct(paidPct, 0)} repaid</span><span>of {inrCompact(principal)}</span></div>
              <dl className="mt-3 grid grid-cols-2 gap-2 border-t border-line pt-3 text-[12.5px]">
                <div><dt className="text-muted">Next EMI</dt><dd className="tnum font-medium">{s.nextDue ? `${inr(l.loan.emi_amount)} · ${dateLabel(s.nextDue.date)}` : '—'}</dd></div>
                <div><dt className="text-muted">Last EMI</dt><dd className="tnum font-medium">{s.closeDate ? dateLabel(s.closeDate) : '—'}</dd></div>
              </dl>
            </Card>
          )
        })}
      </div>

      <ChartCard title="How the balance falls" subtitle="At today's EMIs, by loan"
        table={{ head: ['Month', ...lo.map((l) => l.name)], rows: chart.filter((_, i) => i % Math.max(1, Math.ceil(chart.length / 12)) === 0).map((c) => [c.label, ...lo.map((l) => inr(c[l.name]))]) }}>
        <TimeChart type="area" stacked data={chart} series={lo.map((l) => ({ key: l.name, label: l.name, color: slot(Math.max(order.indexOf(l.id), 0)) }))} height={240} />
      </ChartCard>

      <div className="mt-5 rounded-xl border border-gold-fill/40 bg-gold-soft px-4 py-3.5 text-[13.5px]">
        Want to be debt-free sooner? <Link to="/loans/optimize" className="font-semibold underline">See the fastest way to clear these loans →</Link>
      </div>
    </>
  )
}

export default function Loans() {
  return (
    <>
      <PageHeader title="Loans & EMIs" subtitle="Deducted automatically on their date, re-planned whenever you pay extra." />
      <Tabs items={TABS} />
      <Routes>
        <Route index element={<Dashboard />} />
        <Route path="emis" element={<Emis />} />
        <Route path="schedule" element={<Schedule />} />
        <Route path="optimize" element={<Optimizer />} />
      </Routes>
    </>
  )
}
