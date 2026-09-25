import { useMemo, useState } from 'react'
import { Check, X, Target, Zap, Info } from 'lucide-react'
import { useData } from '../../ctx/DataContext.jsx'
import { Badge, Btn, Card, Empty, Field, Input, Segmented, Select, Stat, StatStrip, cx } from '../../components/ui.jsx'
import { ChartCard, TimeChart } from '../../components/charts.jsx'
import { compareStrategies, simulatePlan, solveForDeadline, STRATEGIES } from '../../lib/loans.js'
import { avgSurplus } from '../../lib/derived.js'
import { inr, inrCompact, monthsToYM } from '../../lib/format.js'
import { monthYear, monthShort } from '../../lib/dates.js'
import { optimiserLoans } from './shared.js'

const DEADLINES = [12, 24, 36, 60, 84, 120]
const yrs = (m) => (m % 12 === 0 ? `${m / 12} year${m === 12 ? '' : 's'}` : `${m} months`)

export default function Optimizer() {
  const { data, derived, today, settings } = useData()
  const loans = useMemo(() => optimiserLoans(derived), [derived])
  const surplus = avgSurplus(data, today, settings.surplusMonths)
  const taxRelief = (settings.taxRelief || 0) / 100

  const [order, setOrder] = useState('avalanche')
  const [extra, setExtra] = useState(() => { const s = surplus && surplus > 0 ? Math.round(Math.min(surplus * 0.3, 30000) / 1000) * 1000 : 5000; return Math.max(s, 5000) })
  const [lump, setLump] = useState(0)
  const [step, setStep] = useState(0)
  const [deadline, setDeadline] = useState(60)
  const [custom, setCustom] = useState('')

  const cfg = { extraMonthly: Number(extra) || 0, lumpSum: Number(lump) || 0, stepUpPct: Number(step) || 0, taxRelief, startISO: today }
  const base = useMemo(() => simulatePlan(loans, { order: 'baseline', startISO: today }), [loans, today])
  const sim = useMemo(() => simulatePlan(loans, { order, ...cfg }), [loans, order, extra, lump, step, taxRelief, today]) // eslint-disable-line
  const compare = useMemo(() => compareStrategies(loans, cfg), [loans, extra, lump, step, taxRelief, today]) // eslint-disable-line
  const target = custom ? Math.max(1, Math.round(Number(custom) * 12)) : deadline
  const options = useMemo(() => solveForDeadline(loans, target, { order, taxRelief, startISO: today }), [loans, target, order, taxRelief, today])

  if (!loans.length) return <Empty title="Nothing to optimise" hint={derived.activeLoans.length ? 'Your loans already close on schedule or their EMI does not cover interest - check the loan details.' : 'Add your loans under EMIs first.'} />

  const monthsSaved = base.done && sim.done ? base.months - sim.months : 0
  const interestSaved = Math.max(base.totalInterest - sim.totalInterest, 0)
  const applyOption = (o) => { setExtra(o.extraMonthly || 0); setLump(o.lumpSum || 0); setStep(o.stepUpPct || 0); window.scrollTo({ top: 0, behavior: 'smooth' }) }
  const fits = (x) => surplus == null ? null : x <= Math.max(surplus, 0)

  // total-outstanding chart: current plan versus doing nothing extra
  const n = Math.min(Math.max(base.months, sim.months, 1), 360)
  const chart = Array.from({ length: n + 1 }, (_, i) => {
    const b = base.timeline[i], p = sim.timeline[i]
    return { label: `${monthShort((b?.date || p?.date || today).slice(0, 7))} ${(b?.date || p?.date || today).slice(2, 4)}`, 'Current plan': Math.round(b ? b.total : 0), 'With your plan': Math.round(p ? p.total : 0) }
  }).filter((_, i) => i % Math.max(1, Math.ceil(n / 60)) === 0 || i === n)

  // month-by-month prepayment plan (first year) + the milestones
  const plan12 = sim.plan.slice(0, 12)
  const nameOf = Object.fromEntries(loans.map((l) => [l.id, l.name]))

  return (
    <div className="space-y-5">
      <Card title="1 · Choose how much extra you can put in">
        <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Extra every month (₹)" hint={surplus != null ? `Typical monthly surplus: ${inr(Math.max(surplus, 0))}` : 'Log income to see your surplus'}><Input type="number" min="0" step="500" inputMode="numeric" value={extra} onChange={(e) => setExtra(e.target.value)} /></Field>
          <Field label="One-time lump sum now (₹)" hint="Bonus, maturity, savings"><Input type="number" min="0" step="1000" inputMode="numeric" value={lump} onChange={(e) => setLump(e.target.value)} /></Field>
          <Field label="Raise the extra by (% a year)"><Input type="number" min="0" max="30" inputMode="decimal" value={step} onChange={(e) => setStep(e.target.value)} /></Field>
          <Field label="Which loan first?"><Select value={order} onChange={(e) => setOrder(e.target.value)}><option value="avalanche">Highest interest rate</option><option value="snowball">Smallest balance</option><option value="tax">Highest rate after tax benefit</option></Select></Field>
        </div>
        <p className="mt-2 flex items-start gap-1.5 text-[12.5px] text-soft"><Info size={13} className="mt-0.5 shrink-0" />{STRATEGIES[order].blurb} When a loan closes, its EMI rolls over to the next one, so your total monthly outgo stays the same.</p>
        {(Number(extra) || 0) > Math.max(surplus ?? Infinity, 0) && <p className="mt-2 rounded-lg bg-rust-soft px-3 py-2 text-[12.5px] text-rust">That is more than the {inr(Math.max(surplus, 0))} a month you have typically had left over. Fine if income is about to rise - otherwise consider a smaller amount or a lump sum.</p>}
      </Card>

      <StatStrip cols={4}>
        <Stat big label="Debt-free by" value={sim.done ? monthYear(sim.debtFreeDate) : 'Not within 60 years'} sub={sim.done ? `${monthsToYM(sim.months)} from now` : undefined} tone="pos" />
        <Stat label="Sooner by" value={monthsSaved ? monthsToYM(monthsSaved) : '—'} sub={base.done ? `instead of ${monthYear(base.debtFreeDate)}` : undefined} />
        <Stat label="Interest saved" value={inr(interestSaved)} sub={`total interest ${inrCompact(sim.totalInterest)} vs ${inrCompact(base.totalInterest)}`} tone={interestSaved > 0 ? 'pos' : 'neutral'} />
        <Stat label="Monthly outgo" value={inr(sim.monthlyOutlay)} sub={`${inr(sim.monthlyOutlay - (Number(extra) || 0))} EMIs + ${inr(Number(extra) || 0)} extra`} />
      </StatStrip>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Total loan balance" subtitle="Your plan versus paying only the EMIs" table={{ head: ['Month', 'Current plan', 'With your plan'], rows: chart.filter((_, i) => i % Math.max(1, Math.ceil(chart.length / 12)) === 0).map((c) => [c.label, inr(c['Current plan']), inr(c['With your plan'])]) }}>
          <TimeChart type="line" data={chart} series={[{ key: 'Current plan', label: 'Current plan', color: 'var(--s2)' }, { key: 'With your plan', label: 'With your plan', color: 'var(--s1)' }]} height={230} />
        </ChartCard>
        <Card title="When each loan closes">
          <ul className="divide-y divide-line">
            {[...sim.closures].sort((a, b) => (a.month ?? 1e9) - (b.month ?? 1e9)).map((c, i) => {
              const b = base.closures.find((x) => x.id === c.id)
              return (
                <li key={c.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="flex min-w-0 items-center gap-2.5"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sunken text-[12px] font-semibold text-soft">{i + 1}</span><span className="truncate text-[13.5px]">{c.name}</span></div>
                  <div className="text-right text-[13px]"><div className="tnum font-medium">{c.date ? monthYear(c.date) : '—'}</div>{b?.date && c.date !== b.date && <div className="text-[11.5px] text-muted">was {monthYear(b.date)}</div>}</div>
                </li>
              )
            })}
          </ul>
        </Card>
      </div>

      <Card title="2 · Compare strategies with the same money" pad={false}>
        <div className="scroll-x p-2 md:p-3">
          <table className="w-full min-w-[640px] text-[13.5px]">
            <thead><tr><th className="th">Strategy</th><th className="th text-right">Debt-free</th><th className="th text-right">Sooner by</th><th className="th text-right">Total interest</th><th className="th text-right">Interest saved</th></tr></thead>
            <tbody>
              {compare.map((c) => (
                <tr key={c.key} className={c.key === order ? 'bg-gold-soft/50' : ''}>
                  <td className="td"><div className="font-medium">{c.label}</div><div className="max-w-[320px] text-[12px] text-muted">{c.blurb}</div></td>
                  <td className="td tnum text-right">{c.sim.done ? monthYear(c.sim.debtFreeDate) : '—'}</td>
                  <td className="td tnum text-right">{c.monthsSaved ? monthsToYM(c.monthsSaved) : '—'}</td>
                  <td className="td tnum text-right">{inr(c.sim.totalInterest)}</td>
                  <td className="td tnum text-right font-medium text-sage">{c.interestSaved > 0 ? inr(c.interestSaved) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="3 · Or start from a deadline - how do I finish everything in…?">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Segmented value={custom ? '' : String(deadline)} onChange={(v) => { setCustom(''); setDeadline(Number(v)) }} options={DEADLINES.map((d) => ({ value: String(d), label: yrs(d) }))} />
          <Input className="!w-28" type="number" min="0.5" step="0.5" placeholder="Custom yrs" aria-label="Custom years" value={custom} onChange={(e) => setCustom(e.target.value)} />
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {options.map((o) => {
            const ok = o.sim.done && o.sim.months <= target
            const monthlyFit = o.extraMonthly ? fits(o.extraMonthly) : null
            const saved = base.done ? Math.max(base.totalInterest - o.sim.totalInterest, 0) : 0
            return (
              <div key={o.mode} className="flex flex-col rounded-lg border border-line p-4">
                <div className="flex items-start justify-between gap-2"><h3 className="text-[14.5px] font-semibold">{o.label}</h3>{ok ? <Badge tone="sage"><Check size={11} />Meets deadline</Badge> : <Badge tone="rust"><X size={11} />Not reachable</Badge>}</div>
                <p className="mt-1 text-[12.5px] text-soft">{o.blurb}</p>
                <dl className="mt-3 grid grid-cols-2 gap-3 text-[12.5px]">
                  {o.lumpSum > 0 && <div><dt className="text-muted">Lump sum now</dt><dd className="tnum mt-0.5 text-[16px] font-semibold">{inr(o.lumpSum)}</dd></div>}
                  {(o.extraMonthly > 0 || !o.lumpSum) && <div><dt className="text-muted">{o.stepUpPct ? 'Extra to start, +10% yearly' : 'Extra every month'}</dt><dd className="tnum mt-0.5 text-[16px] font-semibold">{inr(o.extraMonthly)}</dd></div>}
                  <div><dt className="text-muted">Debt-free</dt><dd className="tnum mt-0.5 text-[14px] font-medium">{o.sim.done ? monthYear(o.sim.debtFreeDate) : '—'}</dd></div>
                  <div><dt className="text-muted">Interest saved</dt><dd className="tnum mt-0.5 text-[14px] font-medium text-sage">{saved > 0 ? inr(saved) : '—'}</dd></div>
                </dl>
                {monthlyFit != null && <p className={cx('mt-2.5 text-[12px]', monthlyFit ? 'text-sage' : 'text-rust')}>{monthlyFit ? 'Fits within your typical monthly surplus.' : `More than your typical surplus of ${inr(Math.max(surplus, 0))}.`}</p>}
                <div className="mt-auto pt-3"><Btn size="sm" onClick={() => applyOption(o)}><Zap size={14} />Use this plan</Btn></div>
              </div>
            )
          })}
        </div>
      </Card>

      <Card title="4 · Your prepayment plan - first 12 months">
        <div className="scroll-x">
          <table className="w-full min-w-[560px] text-[13px]">
            <thead><tr><th className="th">Month</th>{loans.map((l) => <th key={l.id} className="th text-right">{l.name}</th>)}<th className="th text-right">Total out</th></tr></thead>
            <tbody>
              {plan12.map((p) => (
                <tr key={p.month}>
                  <td className="td whitespace-nowrap">{monthYear(p.date)}</td>
                  {loans.map((l) => { const x = p.payments[l.id]; const tot = x.emi + x.extra; return (
                    <td key={l.id} className="td tnum text-right">{tot > 0.5 ? <>{inr(tot)}{x.extra > 0.5 && <div className="text-[11px] font-medium text-gold">incl. {inr(x.extra)} extra</div>}</> : <span className="text-muted">closed</span>}</td>
                  ) })}
                  <td className="td tnum text-right font-medium">{inr(p.outlay)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[12.5px] text-soft"><Target size={14} className="mr-1.5 inline text-gold" />Pay the extra to the lender as a part-prepayment (choose &quot;reduce tenure&quot;), then record it under <b>Schedule → Pay extra</b> so your balances update. Check for prepayment charges on floating vs fixed loans.</p>
      </Card>
    </div>
  )
}
