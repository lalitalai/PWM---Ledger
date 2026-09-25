import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Lightbulb, Save, Info } from 'lucide-react'
import { useData } from '../../ctx/DataContext.jsx'
import { Badge, Btn, Card, Field, Input, Select, Stat, Table } from '../../components/ui.jsx'
import { ChartCard, ShareBar, TimeChart } from '../../components/charts.jsx'
import { goalView } from '../../lib/goalview.js'
import { fvLumpsum, fvSip, inflate, projectGoal, rateScenarios, requiredLumpsum, requiredSip } from '../../lib/goals.js'
import { allocationFor, avenuesFor, blendedReturn, glidePathNote, horizonLabel } from '../../lib/avenues.js'
import { GOAL_TYPES } from '../../lib/constants.js'
import { inr, inrCompact, monthsToYM, pct } from '../../lib/format.js'
import { addMonthsISO, monthShort } from '../../lib/dates.js'
import { numOrNull } from '../../components/forms.jsx'

const RISK_TONE = { 'Very low': 'sage', Low: 'sage', 'Low-Med': 'sage', Medium: 'gold', 'Medium-High': 'gold', High: 'rust' }
const ALLOC_COLOR = { Equity: 'var(--s1)', Debt: 'var(--s3)', Gold: 'var(--s4)' }

export default function Planner() {
  const { data, derived, today, settings, notify, edit } = useData()
  const [sp, setSp] = useSearchParams()
  const goals = data.goals.filter((g) => g.active !== false)
  const gid = sp.get('goal') || goals[0]?.id || 'new'
  const goal = goals.find((g) => g.id === gid)
  const view = goal ? goalView(goal, { derived, sips: data.sip_master, today }) : null

  const initial = () => ({
    target: goal?.target_amount ?? 1000000, years: String(+(((view ? Math.max(view.months, 1) : 60)) / 12).toFixed(1)), rate: goal?.expected_return ?? 12,
    inflation: goal?.inflation_pct ?? 0, stepUp: goal?.step_up_pct ?? 0, corpus: view ? Math.round(view.corpus) : 0, sip: view ? Math.round(view.monthlySip) : 0, type: goal?.goal_type || 'other',
  })
  const [v, setV] = useState(initial)
  const [key, setKey] = useState(gid)
  if (key !== gid) { setKey(gid); setV(initial()) } // switching goal reloads its numbers

  const set = (k) => (e) => setV((o) => ({ ...o, [k]: e.target.value }))
  const P = { target: Number(v.target) || 0, months: Math.max(Math.round((Number(v.years) || 0) * 12), 1), rate: Number(v.rate) || 0, inflation: Number(v.inflation) || 0, stepUp: Number(v.stepUp) || 0, corpus: Number(v.corpus) || 0, sip: Number(v.sip) || 0 }
  const args = { target: P.target, corpus: P.corpus, annualPct: P.rate, months: P.months, inflationPct: P.inflation, stepUpPct: P.stepUp }
  const req = requiredSip(args)
  const lump = requiredLumpsum(args)
  const proj = projectGoal({ ...args, currentSip: P.sip })
  const scen = rateScenarios(args)
  const dirty = goal && (Number(goal.target_amount) !== P.target || Number(goal.expected_return) !== P.rate || Number(goal.inflation_pct) !== P.inflation || Number(goal.step_up_pct) !== P.stepUp)

  const path = useMemo(() => {
    const step = Math.max(1, Math.floor(P.months / 60))
    const out = []
    for (let k = 0; k <= P.months; k += step) {
      const withReq = fvSip(req.sip || 0, P.rate, k, P.stepUp) + fvLumpsum(P.corpus, P.rate, k)
      const withCur = fvSip(P.sip, P.rate, k, P.stepUp) + fvLumpsum(P.corpus, P.rate, k)
      out.push({ k, label: `${monthShort(addMonthsISO(today, k).slice(0, 7))} ${addMonthsISO(today, k).slice(2, 4)}`, Required: Math.round(withReq), Current: Math.round(withCur), Target: Math.round(inflate(P.target, P.inflation, k)) })
    }
    const last = out[out.length - 1]
    if (last.k !== P.months) out.push({ k: P.months, label: `${monthShort(addMonthsISO(today, P.months).slice(0, 7))} ${addMonthsISO(today, P.months).slice(2, 4)}`, Required: Math.round(fvSip(req.sip || 0, P.rate, P.months, P.stepUp) + fvLumpsum(P.corpus, P.rate, P.months)), Current: Math.round(fvSip(P.sip, P.rate, P.months, P.stepUp) + fvLumpsum(P.corpus, P.rate, P.months)), Target: Math.round(inflate(P.target, P.inflation, P.months)) })
    return out
  }, [P.months, P.rate, P.stepUp, P.corpus, P.sip, P.target, P.inflation, req.sip, today])

  const { alloc, list } = avenuesFor(P.months, v.type, settings.assumptions)
  const blended = blendedReturn(alloc, settings.assumptions)
  const need = Math.ceil((req.sip || 0) / 100) * 100

  const save = async () => {
    try { await edit('goals', goal.id, { target_amount: P.target, expected_return: P.rate, inflation_pct: P.inflation, step_up_pct: P.stepUp }); notify('Assumptions saved to the goal') } catch { /* toast */ }
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <Field label="Plan for"><Select value={gid} onChange={(e) => setSp({ goal: e.target.value }, { replace: true })}>
          {goals.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}<option value="new">What-if (no saved goal)</option>
        </Select></Field>
        {goal && dirty && <Btn variant="primary" onClick={save}><Save size={15} />Save these assumptions to the goal</Btn>}
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
        <Card title="Assumptions">
          <div className="grid gap-3.5 sm:grid-cols-2">
            <Field label="Target (today's ₹)"><Input type="number" min="0" inputMode="numeric" value={v.target} onChange={set('target')} /></Field>
            <Field label="Years to go" hint={`${P.months} months`}><Input type="number" min="0.5" step="0.5" inputMode="decimal" value={v.years} onChange={set('years')} /></Field>
            <Field label="Expected return (% a year)" hint="Pick from the scenarios on the right"><Input type="number" min="0" max="30" step="0.5" inputMode="decimal" value={v.rate} onChange={set('rate')} /></Field>
            <Field label="Inflation on the target (%)" hint="0 if the target is already a future value"><Input type="number" min="0" max="20" step="0.5" inputMode="decimal" value={v.inflation} onChange={set('inflation')} /></Field>
            <Field label="Raise the SIP each year (%)"><Input type="number" min="0" max="30" step="1" inputMode="decimal" value={v.stepUp} onChange={set('stepUp')} /></Field>
            <Field label="Already saved for this (₹)" hint={goal ? 'From investments tagged to the goal' : null}><Input type="number" min="0" inputMode="numeric" value={v.corpus} onChange={set('corpus')} /></Field>
            <Field label="SIP you already run for it (₹/mo)" hint={goal ? 'From SIPs tagged to the goal' : null} className="sm:col-span-2"><Input type="number" min="0" inputMode="numeric" value={v.sip} onChange={set('sip')} /></Field>
          </div>
        </Card>

        <div className="space-y-5">
          <Card>
            <div className="grid gap-5 sm:grid-cols-2">
              <Stat big label="SIP needed every month" value={req.achieved ? '₹0' : inr(need)} tone={req.achieved ? 'pos' : 'gold'}
                sub={req.achieved ? 'What you have already will reach the target' : `for ${monthsToYM(P.months)} at ${pct(P.rate)}${P.stepUp ? `, rising ${P.stepUp}% a year` : ''}`} />
              <div className="space-y-3">
                <Stat label="Or one lump sum today" value={inr(Math.ceil(lump / 100) * 100)} sub="if you invested it all now instead" />
                <Stat label="Target at that date" value={inrCompact(req.adjustedTarget)} sub={P.inflation ? `${inrCompact(P.target)} today, inflated ${P.inflation}% a year` : 'as entered'} />
              </div>
            </div>
            <div className="mt-4 rounded-lg bg-sunken px-3.5 py-3 text-[13px]">
              {P.sip > 0 ? (
                <>With your current SIP of <b>{inr(P.sip)}</b> you would reach <b>{inrCompact(proj.projected)}</b> - <b className={proj.status === 'on_track' ? 'text-sage' : proj.status === 'close' ? 'text-gold' : 'text-rust'}>{pct(proj.fundedPct, 0)} of the target</b>
                  {proj.shortfall > 0 ? <>, short by {inrCompact(proj.shortfall)}. Adding <b>{inr(Math.max(need - P.sip, 0))}</b> a month closes the gap.</> : '. You are on track.'}</>
              ) : <>You have no SIP running for this goal yet. Tag an existing SIP to it under <Link className="underline" to="/invest/sips">SIPs</Link>, or start one for {inr(need)}.</>}
            </div>
          </Card>

          <ChartCard title="How the money grows" subtitle="Corpus over time versus the (inflation-adjusted) target"
            table={{ head: ['Date', 'With required SIP', 'With current SIP', 'Target'], rows: path.filter((_, i) => i % Math.max(1, Math.ceil(path.length / 12)) === 0).map((p) => [p.label, inr(p.Required), inr(p.Current), inr(p.Target)]) }}>
            <TimeChart type="line" data={path} series={[{ key: 'Required', label: 'With required SIP' }, { key: 'Current', label: 'With current SIP', color: 'var(--s2)' }, { key: 'Target', label: 'Target', color: 'var(--ink)', dash: '5 4' }]} height={230} />
          </ChartCard>
        </div>
      </div>

      <Card title="If returns differ - SIP needed at each rate">
        <div className="scroll-x">
          <table className="w-full min-w-[420px] text-[13.5px]">
            <thead><tr><th className="th">Return a year</th>{scen.map((s) => <th key={s.rate} className="th text-right">{s.rate}%</th>)}</tr></thead>
            <tbody>
              <tr><td className="td font-medium">SIP a month</td>{scen.map((s) => <td key={s.rate} className={`td tnum text-right ${Math.abs(s.rate - P.rate) < 0.01 ? 'font-semibold text-gold' : ''}`}>{inr(Math.ceil((s.sip || 0) / 100) * 100)}</td>)}</tr>
            </tbody>
          </table>
        </div>
        <p className="mt-2.5 flex items-start gap-1.5 text-[12px] text-muted"><Info size={13} className="mt-0.5 shrink-0" />Higher returns need riskier assets. Plan with the lower rows if you cannot stomach a bad year.</p>
      </Card>

      <Card title={`Where could this money go? · ${horizonLabel(P.months)}`}>
        <div className="mb-1 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
          <div>
            <p className="mb-2.5 text-[13px] text-soft">A simple age-of-goal mix for {monthsToYM(P.months)} away:</p>
            <ShareBar items={[{ name: 'Equity', value: alloc.equity }, { name: 'Debt', value: alloc.debt }, { name: 'Gold', value: alloc.gold }].filter((x) => x.value > 0)} fmt={() => ''} colorOf={(it) => ALLOC_COLOR[it.name]} />
            <p className="mt-3 text-[12.5px] text-soft">Blended expected return of this mix: <b className="text-ink">{pct(blended)}</b> {Math.abs(blended - P.rate) > 1 && <span className="text-gold">(you assumed {pct(P.rate)} - {blended < P.rate ? 'the mix may not deliver that' : 'you may be too cautious'})</span>}</p>
            <p className="mt-2 flex items-start gap-1.5 text-[12.5px] text-soft"><Lightbulb size={14} className="mt-0.5 shrink-0 text-gold" />{glidePathNote(P.months)}</p>
          </div>
          <ul className="divide-y divide-line">
            {list.map((a) => (
              <li key={a.name} className="py-2.5 first:pt-0">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <span className="text-[14px] font-medium">{a.name}</span>
                  <span className="flex items-center gap-1.5"><Badge tone={RISK_TONE[a.risk] || 'neutral'}>{a.risk} risk</Badge><span className="tnum text-[12.5px] text-soft">{a.ret[0].toFixed(1)}–{a.ret[1].toFixed(1)}%</span></span>
                </div>
                <p className="mt-0.5 text-[12.5px] text-soft">{a.why}</p>
                <p className="text-[12px] text-muted">How: {a.how}</p>
              </li>
            ))}
          </ul>
        </div>
        <p className="mt-4 border-t border-line pt-3 text-[11.5px] text-muted">Educational guidance based on the time left, not personalised investment advice. Expected returns are assumptions you can edit in Settings - they are not promises. Government scheme rates (PPF, SSY, EPF) change; check the latest notified rate.</p>
      </Card>
    </div>
  )
}
