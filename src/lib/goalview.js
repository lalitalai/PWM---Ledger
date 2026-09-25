// Everything a goal card needs, in one call (used by Home and the Goals screens).
import { goalCorpus, goalMonthlySip } from './portfolio.js'
import { goalMonthsLeft, requiredSip, projectGoal, requiredLumpsum } from './goals.js'

export function goalView(goal, { derived, sips, today }) {
  const months = goalMonthsLeft(goal.target_date, today)
  const { holdings, invested: corpus } = goalCorpus(goal, derived.holdings, sips)
  const monthlySip = goalMonthlySip(goal.id, sips)
  const args = {
    target: Number(goal.target_amount) || 0, corpus, annualPct: Number(goal.expected_return) || 0, months,
    inflationPct: Number(goal.inflation_pct) || 0, stepUpPct: Number(goal.step_up_pct) || 0,
  }
  const req = requiredSip(args)
  const proj = projectGoal({ ...args, currentSip: monthlySip })
  const lump = requiredLumpsum(args)
  const target = args.target
  const achieved = corpus >= target && target > 0
  const progressPct = target > 0 ? Math.min((corpus / target) * 100, 100) : 0
  const status = achieved ? 'achieved' : months <= 0 ? 'behind' : proj.status
  return { goal, months, holdings, corpus, monthlySip, args, req, proj, lump, achieved, progressPct, status, gap: Math.max(req.sip - monthlySip, 0) }
}
