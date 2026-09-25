import { useState } from 'react'
import { Link, Route, Routes } from 'react-router-dom'
import { Pencil, Plus, X, Link2 } from 'lucide-react'
import { useData } from '../ctx/DataContext.jsx'
import { Badge, Btn, Card, ConfirmDelete, Empty, Field, Input, Modal, PageHeader, Progress, Select, Stat, StatStrip, Table, Tabs, Textarea } from '../components/ui.jsx'
import { HBars } from '../components/charts.jsx'
import { useForm, numOrNull, nz } from '../components/forms.jsx'
import Planner from './goals/Planner.jsx'
import { goalView } from '../lib/goalview.js'
import { STATUS_LABEL } from '../lib/goals.js'
import { GOAL_TYPES, goalTypeLabel } from '../lib/constants.js'
import { inr, inrCompact, monthsToYM, pct } from '../lib/format.js'
import { dateLabel, addMonthsISO } from '../lib/dates.js'

const TABS = [
  { to: '/goals', label: 'Dashboard', end: true },
  { to: '/goals/plan', label: 'Planner & ideas' },
  { to: '/goals/manage', label: 'Manage goals' },
]
const TONE = { on_track: 'sage', achieved: 'sage', close: 'gold', behind: 'rust' }

function GoalModal({ row, onClose }) {
  const { add, edit, today, notify } = useData()
  const [f, set] = useForm({
    name: row?.name || '', goal_type: row?.goal_type || 'other', target_amount: row?.target_amount ?? '', target_date: row?.target_date || addMonthsISO(today, 60),
    expected_return: row?.expected_return ?? 12, inflation_pct: row?.inflation_pct ?? 6, step_up_pct: row?.step_up_pct ?? 0, manual_amount: row?.manual_amount ?? 0, priority: row?.priority ?? 3, notes: row?.notes || '', active: row?.active ?? true,
  })
  const save = async (e) => {
    e.preventDefault()
    const body = {
      name: f.name.trim(), goal_type: f.goal_type, target_amount: numOrNull(f.target_amount), target_date: f.target_date, expected_return: numOrNull(f.expected_return) ?? 12, inflation_pct: numOrNull(f.inflation_pct) ?? 0,
      step_up_pct: numOrNull(f.step_up_pct) ?? 0, manual_amount: numOrNull(f.manual_amount) ?? 0, priority: Number(f.priority) || 3, notes: nz(f.notes.trim()), active: f.active,
    }
    try { row ? await edit('goals', row.id, body) : await add('goals', body); notify(row ? 'Goal updated' : 'Goal added'); onClose() } catch { /* toast */ }
  }
  return (
    <Modal open wide onClose={onClose} title={row ? 'Edit goal' : 'New goal'} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn variant="primary" type="submit" form="goal-form">Save goal</Btn></>}>
      <form id="goal-form" onSubmit={save} className="grid gap-3.5 sm:grid-cols-2">
        <Field label="Goal" className="sm:col-span-2"><Input required autoFocus={!row} value={f.name} onChange={set('name')} placeholder="e.g. Home down payment" /></Field>
        <Field label="Type"><Select value={f.goal_type} onChange={set('goal_type')}>{GOAL_TYPES.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}</Select></Field>
        <Field label="Priority" hint="1 = most important"><Select value={f.priority} onChange={set('priority')}>{[1, 2, 3, 4, 5].map((p) => <option key={p}>{p}</option>)}</Select></Field>
        <Field label="Target amount (today's ₹)"><Input required type="number" min="1" inputMode="numeric" value={f.target_amount} onChange={set('target_amount')} /></Field>
        <Field label="Needed by"><Input required type="date" min={today} value={f.target_date} onChange={set('target_date')} /></Field>
        <Field label="Expected return (% a year)"><Input type="number" min="0" max="30" step="0.5" inputMode="decimal" value={f.expected_return} onChange={set('expected_return')} /></Field>
        <Field label="Inflation on the target (%)" hint="Costs rise - 0 if the target is already in future rupees"><Input type="number" min="0" max="20" step="0.5" inputMode="decimal" value={f.inflation_pct} onChange={set('inflation_pct')} /></Field>
        <Field label="Raise the SIP each year (%)"><Input type="number" min="0" max="30" inputMode="decimal" value={f.step_up_pct} onChange={set('step_up_pct')} /></Field>
        <Field label="Other savings counted (₹)" hint="Cash / FD not tracked as an investment"><Input type="number" min="0" inputMode="numeric" value={f.manual_amount} onChange={set('manual_amount')} /></Field>
        <label className="flex items-center gap-2 text-[13.5px] sm:col-span-2"><input type="checkbox" checked={f.active} onChange={set('active')} className="h-4 w-4 accent-[var(--gold-fill)]" />Active</label>
        <Field label="Notes" className="sm:col-span-2"><Textarea value={f.notes} onChange={set('notes')} /></Field>
      </form>
    </Modal>
  )
}

/** Tag SIPs and investments to a goal from the goal side. */
function LinkPanel({ view }) {
  const { data, edit, notify } = useData()
  const g = view.goal
  const linked = data.sip_master.filter((s) => s.goal_id === g.id)
  const others = data.sip_master.filter((s) => s.goal_id !== g.id && s.active !== false)
  const directHoldings = data.holdings.filter((h) => h.goal_id === g.id && h.active !== false)
  const freeHoldings = data.holdings.filter((h) => !h.goal_id && h.active !== false)
  const act = async (fn, msg) => { try { await fn(); notify(msg) } catch { /* toast */ } }
  return (
    <div className="mt-4 grid gap-4 border-t border-line pt-4 sm:grid-cols-2">
      <div>
        <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">SIPs for this goal · {inr(view.monthlySip)}/mo</div>
        <div className="flex flex-wrap gap-1.5">
          {linked.length === 0 && <span className="text-[12.5px] text-muted">None tagged yet</span>}
          {linked.map((s) => (
            <span key={s.id} className="inline-flex max-w-full items-center gap-1 rounded-full border border-line bg-sunken py-0.5 pl-2.5 pr-1 text-[12px]">
              <span className="truncate">{s.fund_name.replace(/ - Direct.*$/i, '')} · {inr(s.amount)}</span>
              <button className="rounded-full p-0.5 text-muted hover:bg-line" aria-label={`Untag ${s.fund_name}`} onClick={() => act(() => edit('sip_master', s.id, { goal_id: null }), 'SIP untagged')}><X size={12} /></button>
            </span>
          ))}
        </div>
        {others.length > 0 && (
          <select className="field-input mt-2 !min-h-[34px] !py-1 !text-[12.5px]" value="" aria-label="Tag a SIP to this goal" onChange={(e) => e.target.value && act(() => edit('sip_master', e.target.value, { goal_id: g.id }), 'SIP tagged to this goal')}>
            <option value="">+ Tag a SIP to this goal…</option>
            {others.map((s) => <option key={s.id} value={s.id}>{s.fund_name} · {inr(s.amount)}{s.goal_id ? ` (now: ${data.goals.find((x) => x.id === s.goal_id)?.name || 'other goal'})` : ''}</option>)}
          </select>
        )}
      </div>
      <div>
        <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">Investments counted · {inrCompact(view.corpus - Number(g.manual_amount || 0))}</div>
        <div className="flex flex-wrap gap-1.5">
          {view.holdings.length === 0 && <span className="text-[12.5px] text-muted">None yet</span>}
          {view.holdings.map((h) => (
            <span key={h.id} className="inline-flex max-w-full items-center gap-1 rounded-full border border-line bg-sunken py-0.5 pl-2.5 pr-1 text-[12px]">
              <span className="truncate">{h.name.replace(/ - Direct.*$/i, '')} · {inrCompact(h.value)}</span>
              {directHoldings.some((d) => d.id === h.id) && <button className="rounded-full p-0.5 text-muted hover:bg-line" aria-label={`Untag ${h.name}`} onClick={() => act(() => edit('holdings', h.id, { goal_id: null }), 'Investment untagged')}><X size={12} /></button>}
            </span>
          ))}
        </div>
        {freeHoldings.length > 0 && (
          <select className="field-input mt-2 !min-h-[34px] !py-1 !text-[12.5px]" value="" aria-label="Tag an investment to this goal" onChange={(e) => e.target.value && act(() => edit('holdings', e.target.value, { goal_id: g.id }), 'Investment tagged to this goal')}>
            <option value="">+ Count an investment toward this goal…</option>
            {freeHoldings.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
          </select>
        )}
      </div>
    </div>
  )
}

function Dashboard() {
  const { data, derived, today } = useData()
  const [open, setOpen] = useState(null)
  const views = data.goals.filter((g) => g.active !== false).map((g) => goalView(g, { derived, sips: data.sip_master, today })).sort((a, b) => a.goal.priority - b.goal.priority || (a.goal.target_date < b.goal.target_date ? -1 : 1))
  const totalTarget = views.reduce((s, v) => s + Number(v.goal.target_amount), 0)
  const totalCorpus = views.reduce((s, v) => s + Math.min(v.corpus, Number(v.goal.target_amount)), 0)
  const sipNow = views.reduce((s, v) => s + v.monthlySip, 0)
  const sipNeeded = views.reduce((s, v) => s + (v.req.sip || 0), 0)
  const onTrack = views.filter((v) => v.status === 'on_track' || v.status === 'achieved').length

  if (!views.length) return <Empty title="No goals yet" hint="Set a target and date and we will work out the monthly SIP, then help you tag the SIPs that fund it." action={<Link to="/goals/manage" className="btn btn-primary">Add your first goal</Link>} />
  return (
    <>
      <StatStrip cols={4}>
        <Stat big label="Saved toward goals" value={inr(totalCorpus)} sub={`of ${inrCompact(totalTarget)} in today's money`} />
        <Stat label="On track" value={`${onTrack} of ${views.length}`} tone={onTrack === views.length ? 'pos' : 'neutral'} sub="at today's SIPs" />
        <Stat label="SIPs tagged to goals" value={inr(sipNow)} sub="per month" />
        <Stat label="SIPs needed in total" value={inr(Math.ceil(sipNeeded / 100) * 100)} sub={sipNeeded > sipNow ? `${inr(Math.ceil((sipNeeded - sipNow) / 100) * 100)} more a month` : 'you are covered'} tone={sipNeeded > sipNow ? 'neg' : 'pos'} />
      </StatStrip>

      <div className="grid gap-4 lg:grid-cols-2">
        {views.map((v) => {
          const g = v.goal
          const isOpen = open === g.id
          return (
            <Card key={g.id}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate text-[16px] font-semibold">{g.name}</h3>
                  <p className="text-[12.5px] text-soft">{goalTypeLabel(g.goal_type)} · {dateLabel(g.target_date)} · {v.months > 0 ? monthsToYM(v.months) + ' to go' : 'due'}</p>
                </div>
                <Badge tone={TONE[v.status]}>{STATUS_LABEL[v.status]}</Badge>
              </div>
              <div className="mt-3.5"><Progress value={v.progressPct} tone={TONE[v.status] === 'rust' ? 'rust' : TONE[v.status] === 'gold' ? 'gold' : 'sage'} height={10} /></div>
              <div className="mt-1.5 flex justify-between text-[12.5px] text-soft"><span className="tnum">{inr(v.corpus)} saved</span><span className="tnum">{pct(v.progressPct, 0)} of {inrCompact(g.target_amount)}</span></div>
              <dl className="mt-4 grid grid-cols-3 gap-3 text-[12.5px]">
                <div><dt className="text-muted">SIP now</dt><dd className="tnum mt-0.5 text-[15px] font-semibold">{inr(v.monthlySip)}</dd></div>
                <div><dt className="text-muted">SIP needed</dt><dd className="tnum mt-0.5 text-[15px] font-semibold text-gold">{v.achieved ? '₹0' : inr(Math.ceil((v.req.sip || 0) / 100) * 100)}</dd></div>
                <div><dt className="text-muted">Projected</dt><dd className="tnum mt-0.5 text-[15px] font-semibold">{inrCompact(v.proj.projected)}</dd></div>
              </dl>
              <p className="mt-3 text-[12.5px] text-soft">
                {v.achieved ? 'Target reached - consider moving this money to safer assets.' : v.gap > 0 ? <>Add <b className="text-ink">{inr(Math.ceil(v.gap / 100) * 100)}</b> a month to reach {inrCompact(v.req.adjustedTarget)} at {pct(g.expected_return, 1)} a year.</> : `Your SIPs cover the ${inrCompact(v.req.adjustedTarget)} needed at ${pct(g.expected_return, 1)} a year.`}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link to={`/goals/plan?goal=${g.id}`} className="btn btn-secondary btn-sm">Plan & ideas</Link>
                <Btn size="sm" variant="ghost" onClick={() => setOpen(isOpen ? null : g.id)} aria-expanded={isOpen}><Link2 size={14} />{isOpen ? 'Hide' : 'Tag SIPs & investments'}</Btn>
              </div>
              {isOpen && <LinkPanel view={v} />}
            </Card>
          )
        })}
      </div>
    </>
  )
}

function Manage() {
  const { data, del, notify, today } = useData()
  const [modal, setModal] = useState(null)
  return (
    <>
      <div className="mb-3 flex justify-end"><Btn variant="primary" onClick={() => setModal({})}><Plus size={16} />New goal</Btn></div>
      <Card pad={false}>
        <div className="p-2 md:p-3">
          {data.goals.length === 0 ? <div className="p-2"><Empty title="No goals" action={<Btn variant="primary" onClick={() => setModal({})}>Add a goal</Btn>} /></div> : (
            <Table head={['Goal', 'Needed by', { label: 'Target', right: true }, { label: 'Return', right: true }, { label: 'Inflation', right: true }, 'P', '']}>
              {data.goals.map((g) => (
                <tr key={g.id} className={g.active === false ? 'opacity-60' : ''}>
                  <td className="td font-medium">{g.name}<div className="text-[12px] font-normal text-muted">{goalTypeLabel(g.goal_type)}{g.active === false ? ' · inactive' : ''}</div></td>
                  <td className="td whitespace-nowrap text-soft">{dateLabel(g.target_date)}</td>
                  <td className="td tnum text-right">{inr(g.target_amount)}</td>
                  <td className="td tnum text-right text-soft">{pct(g.expected_return)}</td>
                  <td className="td tnum text-right text-soft">{pct(g.inflation_pct)}</td>
                  <td className="td text-soft">{g.priority}</td>
                  <td className="td whitespace-nowrap text-right"><Btn size="sm" variant="ghost" aria-label={`Edit ${g.name}`} onClick={() => setModal({ row: g })}><Pencil size={14} /></Btn><ConfirmDelete onConfirm={async () => { try { await del('goals', g.id); notify('Goal deleted - its SIPs and investments stay') } catch { /* toast */ } }} /></td>
                </tr>
              ))}
            </Table>
          )}
        </div>
      </Card>
      {modal && <GoalModal row={modal.row} onClose={() => setModal(null)} />}
    </>
  )
}

export default function Goals() {
  return (
    <>
      <PageHeader title="Goals" subtitle="What you are saving for, what it needs each month, and which SIPs feed it." />
      <Tabs items={TABS} />
      <Routes>
        <Route index element={<Dashboard />} />
        <Route path="plan" element={<Planner />} />
        <Route path="manage" element={<Manage />} />
      </Routes>
    </>
  )
}
