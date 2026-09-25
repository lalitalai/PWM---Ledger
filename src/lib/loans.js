// Loan optimisation: how to clear every loan sooner, and what it costs.
//
// Every strategy holds the total monthly outlay constant: (sum of all EMIs + extra).
// When a loan closes, its EMI is *rolled over* to the next priority loan (the "snowball" effect).
// The baseline is the opposite: every loan just keeps paying its own EMI.
import { addMonthsISO } from './dates.js'

const EPS = 0.005

export const STRATEGIES = {
  baseline: { label: 'Current plan (no extra)', blurb: 'Every loan keeps paying its own EMI until it ends.' },
  avalanche: { label: 'Avalanche - highest rate first', blurb: 'Mathematically cheapest: all extra money goes to the loan with the highest interest rate.' },
  snowball: { label: 'Snowball - smallest balance first', blurb: 'Closes loans fastest, one by one. Motivating, slightly more interest than avalanche.' },
  tax: { label: 'Tax-aware - after tax relief', blurb: 'Like avalanche, but loans that earn a tax deduction (e.g. home loan) are ranked lower.' },
}

function priorityOrder(state, order, taxRelief) {
  const open = state.filter((l) => l.bal > EPS)
  const eff = (l) => l.rate * (1 - (l.taxDeductible ? taxRelief : 0))
  if (order === 'snowball') return open.sort((a, b) => a.bal - b.bal || b.rate - a.rate)
  if (order === 'tax') return open.sort((a, b) => eff(b) - eff(a) || a.bal - b.bal)
  return open.sort((a, b) => b.rate - a.rate || a.bal - b.bal) // avalanche
}

/**
 * @param loans  [{ id, name, balance, rate, emi, taxDeductible }]  - balances as of today
 * @param opts   { order, extraMonthly, lumpSum, stepUpPct, taxRelief, startISO, maxMonths }
 */
export function simulatePlan(loans, opts = {}) {
  const {
    order = 'avalanche', extraMonthly = 0, lumpSum = 0, stepUpPct = 0, taxRelief = 0.25,
    startISO, maxMonths = 720,
  } = opts
  const rollover = order !== 'baseline'
  const st = loans.map((l) => ({ ...l, bal: Number(l.balance) || 0, rate: Number(l.rate) || 0, emi: Number(l.emi) || 0 }))
  const totalEmi = st.reduce((s, l) => s + l.emi, 0)
  const snap = () => Object.fromEntries(st.map((l) => [l.id, Math.max(l.bal, 0)]))
  const timeline = [{ month: 0, date: startISO, balances: snap(), total: st.reduce((s, l) => s + l.bal, 0) }]
  const plan = []
  const closures = {}
  let totalInterest = 0, totalPaid = 0, lumpApplied = 0

  // One-time lump sum today
  if (rollover && lumpSum > 0) {
    let budget = lumpSum
    for (const l of priorityOrder(st, order, taxRelief)) {
      const pay = Math.min(budget, l.bal)
      l.bal -= pay; budget -= pay; lumpApplied += pay
      if (budget <= EPS) break
    }
    totalPaid += lumpApplied
    st.forEach((l) => { if (l.bal <= EPS && l.balance > 0 && closures[l.id] === undefined) closures[l.id] = 0 })
    timeline[0] = { month: 0, date: startISO, balances: snap(), total: st.reduce((s, l) => s + Math.max(l.bal, 0), 0) }
  }

  let m = 0
  while (st.some((l) => l.bal > EPS) && m < maxMonths) {
    m++
    const extra = extraMonthly * Math.pow(1 + stepUpPct / 100, Math.floor((m - 1) / 12))
    let budget = rollover ? totalEmi + extra : Infinity
    const pays = Object.fromEntries(st.map((l) => [l.id, { emi: 0, extra: 0, interest: 0 }]))
    for (const l of st) {
      if (l.bal <= EPS) continue
      const interest = l.bal * (l.rate / 1200)
      l.bal += interest; totalInterest += interest; pays[l.id].interest = interest
    }
    for (const l of st) {
      if (l.bal <= EPS) continue
      const pay = Math.min(l.emi, l.bal)
      l.bal -= pay; if (rollover) budget -= pay; pays[l.id].emi = pay; totalPaid += pay
    }
    if (rollover && budget > EPS) {
      for (const l of priorityOrder(st, order, taxRelief)) {
        const pay = Math.min(budget, l.bal)
        if (pay <= 0) continue
        l.bal -= pay; budget -= pay; pays[l.id].extra = pay; totalPaid += pay
        if (budget <= EPS) break
      }
    }
    for (const l of st) if (l.bal <= EPS && closures[l.id] === undefined) closures[l.id] = m
    const date = startISO ? addMonthsISO(startISO, m) : undefined
    plan.push({ month: m, date, payments: pays, outlay: Object.values(pays).reduce((s, p) => s + p.emi + p.extra, 0) })
    timeline.push({ month: m, date, balances: snap(), total: st.reduce((s, l) => s + Math.max(l.bal, 0), 0) })
  }
  const done = !st.some((l) => l.bal > EPS)
  return {
    order, months: done ? m : Infinity, done,
    debtFreeDate: done && startISO ? addMonthsISO(startISO, m) : null,
    totalInterest, totalPaid, lumpApplied,
    monthlyOutlay: totalEmi + extraMonthly,
    closures: st.map((l) => ({ id: l.id, name: l.name, month: closures[l.id] ?? null, date: closures[l.id] != null && startISO ? addMonthsISO(startISO, closures[l.id]) : null })),
    timeline, plan,
  }
}

/** All four strategies side by side, with savings relative to the baseline. */
export function compareStrategies(loans, { extraMonthly = 0, lumpSum = 0, stepUpPct = 0, taxRelief = 0.25, startISO } = {}) {
  const base = simulatePlan(loans, { order: 'baseline', startISO })
  const out = [{ key: 'baseline', ...STRATEGIES.baseline, sim: base, monthsSaved: 0, interestSaved: 0 }]
  for (const key of ['avalanche', 'snowball', 'tax']) {
    const sim = simulatePlan(loans, { order: key, extraMonthly, lumpSum, stepUpPct, taxRelief, startISO })
    out.push({
      key, ...STRATEGIES[key], sim,
      monthsSaved: base.done && sim.done ? base.months - sim.months : 0,
      interestSaved: Math.max(base.totalInterest - sim.totalInterest, 0),
    })
  }
  return out
}

function bisect(fn, lo, hi, iters = 60) {
  // smallest x in [lo, hi] with fn(x) === true (fn is monotone: false...false,true...true)
  if (fn(lo)) return lo
  for (let k = 0; k < iters; k++) {
    const mid = (lo + hi) / 2
    if (fn(mid)) hi = mid; else lo = mid
  }
  return hi
}

/**
 * "Finish all loans within `targetMonths`" - four ways to fund it.
 *  monthly  : the same extra amount every month
 *  lump     : one payment today, nothing extra afterwards
 *  balanced : half of the lump-only amount today + the monthly extra needed on top
 *  stepup   : extra starts lower and rises 10% every year (matches salary growth)
 */
export function solveForDeadline(loans, targetMonths, { order = 'avalanche', taxRelief = 0.25, startISO } = {}) {
  const total = loans.reduce((s, l) => s + (Number(l.balance) || 0), 0)
  const finishes = (o) => { const r = simulatePlan(loans, { order, taxRelief, startISO, ...o }); return r.done && r.months <= targetMonths }
  const ceil100 = (x) => Math.ceil(x / 100) * 100
  const baseDone = finishes({})
  const hi = Math.max(total, 1)
  const mk = (mode, o, label, blurb) => ({ mode, label, blurb, ...o, sim: simulatePlan(loans, { order, taxRelief, startISO, ...o }), targetMonths })

  if (baseDone) {
    return [mk('monthly', { extraMonthly: 0, lumpSum: 0 }, 'Already on track', `At today's EMIs every loan closes within ${targetMonths} months - no extra needed.`)]
  }
  const monthly = ceil100(bisect((x) => finishes({ extraMonthly: x }), 0, hi))
  const lump = ceil100(bisect((x) => finishes({ lumpSum: x }), 0, hi))
  const halfLump = ceil100(lump / 2)
  const balancedExtra = ceil100(bisect((x) => finishes({ lumpSum: halfLump, extraMonthly: x }), 0, hi))
  const stepUp = ceil100(bisect((x) => finishes({ extraMonthly: x, stepUpPct: 10 }), 0, hi))
  return [
    mk('monthly', { extraMonthly: monthly }, 'Same extra every month', 'Simple and steady: add the same amount to your EMIs each month.'),
    mk('lump', { lumpSum: lump }, 'One lump sum now', 'Use a bonus, maturity or savings once; keep paying only the current EMIs.'),
    mk('balanced', { lumpSum: halfLump, extraMonthly: balancedExtra }, 'Half lump sum + monthly', 'Part-prepay now with savings and cover the rest monthly.'),
    mk('stepup', { extraMonthly: stepUp, stepUpPct: 10 }, 'Rising extra (+10% a year)', 'Start lighter and raise the extra as your salary grows.'),
  ]
}
