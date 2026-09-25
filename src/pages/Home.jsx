import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, TrendingUp, Wallet, FileUp, ArrowRight, Repeat, Landmark } from 'lucide-react'
import { useData } from '../ctx/DataContext.jsx'
import { Card, PageHeader, Select, Stat, Badge, Progress, Empty, Btn, cx } from '../components/ui.jsx'
import { ChartCard, Donut, TimeChart, slot } from '../components/charts.jsx'
import { EXPENSE_CATEGORIES } from '../lib/constants.js'
import { monthCashflow } from '../lib/derived.js'
import { inr, inrCompact, pct } from '../lib/format.js'
import { dateShort, financialYearLabel, financialYearMonths, lastMonths, monthLabel, monthShort, dateLabel, daysBetween, ym } from '../lib/dates.js'
import { upcomingSips } from '../lib/schedule.js'
import { goalView } from '../lib/goalview.js'
import { STATUS_LABEL } from '../lib/goals.js'

const TONE = { on_track: 'sage', achieved: 'sage', close: 'gold', behind: 'rust' }
const catColor = (name) => slot(Math.max(EXPENSE_CATEGORIES.indexOf(name), 0))

function greeting() { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening' }

export default function Home() {
  const { data, derived, today, me, household } = useData()
  const t = derived.thisMonth
  const spentOut = t.expenses + t.emi
  const series = derived.cashflow.slice(-6).map((c) => ({ label: monthShort(c.month), Spending: Math.round(c.expenses), EMIs: Math.round(c.emi), Investing: Math.round(c.invested), income: Math.round(c.income), leftover: Math.round(c.leftover) }))

  const sips = upcomingSips(data.sip_master, today, 14).map((x) => ({ date: x.date, kind: 'sip', title: x.sip.fund_name, amt: Number(x.sip.amount), person: x.sip.person }))
  const emis = derived.activeLoans.filter((l) => l.summary.nextDue && daysBetween(today, l.summary.nextDue.date) <= 14)
    .map((l) => ({ date: l.summary.nextDue.date, kind: 'emi', title: l.loan.name, amt: Number(l.loan.emi_amount), person: l.loan.person }))
  const upcoming = [...sips, ...emis].sort((a, b) => (a.date < b.date ? -1 : 1))

  // Month picker driving both pies below.
  const monthOptions = lastMonths(ym(today), 12)
  const [selMonth, setSelMonth] = useState(ym(today))
  const selCf = monthCashflow(data, selMonth)
  const selOutflow = selCf.expenses + selCf.emi + selCf.invested
  const mix = [
    { name: 'Total income', value: selCf.income }, { name: 'Expenses', value: selCf.expenses },
    { name: 'EMIs deducted', value: selCf.emi }, { name: 'Investments', value: selCf.invested },
  ].filter((x) => x.value > 0)
  const mixColor = { 'Total income': 'var(--s1)', Expenses: 'var(--s5)', 'EMIs deducted': 'var(--s3)', Investments: 'var(--s2)' }
  const catMap = new Map()
  for (const e of data.expenses) { if (e.category === 'Credit Card Payment' || e.date.slice(0, 7) !== selMonth) continue; catMap.set(e.category, (catMap.get(e.category) || 0) + Number(e.amount)) }
  const catItems = [...catMap.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)

  // Income vs outflow, dual bar, across the current Indian financial year (Apr - Mar).
  const fyMonths = financialYearMonths(today)
  const fySeries = fyMonths.map((m) => { const c = monthCashflow(data, m); return { label: monthShort(m), month: m, Income: Math.round(c.income), Outflow: Math.round(c.expenses + c.emi + c.invested) } })

  const goals = data.goals.filter((g) => g.active !== false).map((g) => goalView(g, { derived, sips: data.sip_master, today })).sort((a, b) => a.goal.priority - b.goal.priority)
  const noHome = data.emi_master.some((l) => l.loan_type === 'Home Loan' && l.active !== false) && !data.holdings.some((h) => h.asset_type === 'real_estate' && h.active !== false)
  const empty = !data.holdings.length && !data.expenses.length && !data.emi_master.length

  return (
    <>
      <PageHeader title={`${greeting()}, ${me || 'there'}`} subtitle={`${household?.name || ''} · ${dateLabel(today)}`}
        actions={<><Link to="/expenses/add" className="btn btn-primary"><Plus size={16} />Expense</Link><Link to="/invest/add" className="btn btn-secondary"><TrendingUp size={16} />Invest more</Link></>} />

      {empty && (
        <Empty title="Let's set up your ledger" hint="Start with banks and cards, then add your SIPs, loans and goals. Or import a CAS PDF to bring in every fund and share at once."
          action={<div className="flex flex-wrap justify-center gap-2"><Link to="/masters" className="btn btn-secondary">Add banks & cards</Link><Link to="/invest/cas" className="btn btn-secondary"><FileUp size={16} />Import CAS</Link><Link to="/loans/emis" className="btn btn-secondary">Add a loan</Link></div>} />
      )}

      <div className="mb-5 grid gap-4 rounded-xl border border-line bg-surface p-4 md:grid-cols-[minmax(0,1.2fr)_minmax(0,2fr)] md:p-5">
        <Stat big label="Net worth" value={inr(derived.netWorth)} sub={`Investments ${inrCompact(derived.totals.value)} − loans ${inrCompact(derived.debt)}${noHome ? ' · your home is not counted' : ''}`} tone={derived.netWorth >= 0 ? 'neutral' : 'neg'} />
        <div className="grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-3 md:self-center">
          <Stat label="Portfolio" value={inrCompact(derived.totals.value)} sub={derived.totals.costKnownInvested > 0 ? `${derived.totals.gain >= 0 ? '+' : ''}${pct(derived.totals.gainPct)} on cost` : undefined} tone="neutral" />
          <Stat label="Loans owed" value={inrCompact(derived.debt)} sub={`${inr(derived.monthlyEmi)}/mo in EMIs`} />
          <Stat label={`${monthLabel(derived.thisMonth.month)} so far`} value={inrCompact(t.leftover)} sub={t.leftover >= 0 ? 'left after spend, EMIs, SIPs' : 'more out than in so far'} tone={t.leftover >= 0 ? 'pos' : 'neg'} />
        </div>
      </div>

      <div className="mb-5 grid gap-4 lg:grid-cols-2">
        <ChartCard title="Where the money went - last 6 months" subtitle={`This month: ${inr(t.income)} in · ${inr(spentOut)} spent · ${inr(t.invested)} invested`}
          table={{ head: ['Month', 'Income', 'Spending', 'EMIs', 'Investing', 'Left over'], rows: series.map((s) => [s.label, inr(s.income), inr(s.Spending), inr(s.EMIs), inr(s.Investing), inr(s.leftover)]) }}>
          <TimeChart type="bar" data={series} series={[{ key: 'Spending', label: 'Spending' }, { key: 'EMIs', label: 'EMIs' }, { key: 'Investing', label: 'Investing' }]} showTotal />
        </ChartCard>

        <Card title="Coming up · next 14 days" action={<Badge tone="sage"><Repeat size={11} />auto-posted on the day</Badge>}>
          {upcoming.length === 0 ? <p className="py-6 text-center text-[13px] text-muted">No SIPs or EMIs due in the next two weeks.</p> : (
            <ul className={cx('divide-y divide-line', upcoming.length > 5 && 'max-h-[275px] overflow-y-auto pr-1')}>
              {upcoming.map((u, i) => (
                <li key={i} className="flex items-center gap-3 py-2.5">
                  <div className="w-12 shrink-0 rounded-lg bg-sunken py-1 text-center text-[12px] font-semibold leading-tight">{dateShort(u.date)}</div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13.5px] text-ink">{u.title}</div>
                    <div className="text-[12px] text-muted">{u.kind === 'sip' ? 'SIP' : 'EMI'}{u.person ? ` · ${u.person}` : ''}</div>
                  </div>
                  <div className="tnum text-[13.5px] font-medium">{inr(u.amt)}</div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="mb-5 grid gap-4 lg:grid-cols-3">
        <Card title="Money mix" subtitle={monthLabel(selMonth)} action={<Select className="!w-auto" value={selMonth} onChange={(e) => setSelMonth(e.target.value)} aria-label="Month">{[...monthOptions].reverse().map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}</Select>}>
          <Donut items={mix} colorOf={(it) => mixColor[it.name]} />
        </Card>
        <Card title="Expenses by category" subtitle={monthLabel(selMonth)}>
          <Donut items={catItems} colorOf={(it) => catColor(it.name)} />
        </Card>
        <Card title="This month's income vs outflow" subtitle={monthLabel(selMonth)}>
          <div className="grid grid-cols-2 gap-4">
            <Stat label="Income" value={inr(selCf.income)} tone="pos" />
            <Stat label="Outflow" value={inr(selOutflow)} sub="expenses + EMIs + investments" tone={selOutflow > selCf.income ? 'neg' : 'neutral'} />
          </div>
          <p className="mt-4 border-t border-line pt-3 text-[12.5px] text-soft">{selCf.income - selOutflow >= 0 ? `${inr(selCf.income - selOutflow)} left over` : `${inr(selOutflow - selCf.income)} more went out than came in`}</p>
        </Card>
      </div>

      <ChartCard title="Income vs outflow, month by month" subtitle={financialYearLabel(today)} className="mb-5"
        table={{ head: ['Month', 'Income', 'Outflow'], rows: fySeries.map((s) => [monthLabel(s.month), inr(s.Income), inr(s.Outflow)]) }}>
        <TimeChart type="bar" data={fySeries} stacked={false} series={[{ key: 'Income', label: 'Income', color: 'var(--s1)' }, { key: 'Outflow', label: 'Outflow', color: 'var(--s5)' }]} height={230} />
      </ChartCard>

      <Card title="Goals" action={<Link to="/goals" className="inline-flex items-center gap-1 text-[12.5px] font-medium text-gold">All goals <ArrowRight size={13} /></Link>}>
        {goals.length === 0 ? <p className="py-4 text-center text-[13px] text-muted">No goals yet. <Link className="underline" to="/goals/manage">Add your first goal</Link> and see the SIP it needs.</p> : (
          <div className="grid gap-x-8 gap-y-5 md:grid-cols-2">
            {goals.map((g) => (
              <div key={g.goal.id}>
                <div className="mb-1.5 flex items-baseline justify-between gap-2">
                  <span className="truncate text-[14px] font-medium">{g.goal.name}</span>
                  <Badge tone={TONE[g.status]}>{STATUS_LABEL[g.status]}</Badge>
                </div>
                <Progress value={g.progressPct} tone={TONE[g.status] === 'rust' ? 'rust' : TONE[g.status] === 'gold' ? 'gold' : 'sage'} />
                <div className="mt-1.5 flex justify-between text-[12px] text-soft">
                  <span className="tnum">{inrCompact(g.corpus)} of {inrCompact(g.goal.target_amount)}</span>
                  <span>{g.achieved ? 'Target reached' : g.gap > 0 ? `Needs +${inr(Math.ceil(g.gap / 100) * 100)}/mo more` : 'SIP is enough'}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Link to="/income" className="btn btn-secondary justify-start"><Wallet size={16} />Log income</Link>
        <Link to="/invest/cas" className="btn btn-secondary justify-start"><FileUp size={16} />Import CAS</Link>
        <Link to="/loans/optimize" className="btn btn-secondary justify-start"><Landmark size={16} />Clear loans faster</Link>
        <Link to="/goals/plan" className="btn btn-secondary justify-start"><ArrowRight size={16} />Plan a goal</Link>
      </div>
    </>
  )
}
