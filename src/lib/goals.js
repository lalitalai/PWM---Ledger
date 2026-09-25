// Goal planning maths: what monthly SIP is needed to reach a target, at a chosen return.
//
// Conventions
//  * The annual return is an *effective* annual rate; the monthly rate is (1+r)^(1/12)-1,
//    so "12% a year" really compounds to 12% over 12 months.
//  * SIP instalments are made at the start of each month (a SIP debits on its date).
//  * Optional inflation: target is expressed in today's money and inflated to the goal date.
//  * Optional annual step-up: the SIP amount rises by x% every 12 instalments.
import { monthsUntil } from './dates.js'

export const monthlyRateEff = (annualPct) => Math.pow(1 + annualPct / 100, 1 / 12) - 1

export function fvLumpsum(pv, annualPct, months) {
  return pv * Math.pow(1 + monthlyRateEff(annualPct), months)
}

/** Future value of a monthly SIP (start-of-month), optionally stepping up each year. */
export function fvSip(monthly, annualPct, months, stepUpPct = 0) {
  const i = monthlyRateEff(annualPct)
  let fv = 0
  for (let k = 0; k < months; k++) {
    const pay = monthly * Math.pow(1 + stepUpPct / 100, Math.floor(k / 12))
    fv += pay * Math.pow(1 + i, months - k)
  }
  return fv
}

export const inflate = (amount, inflationPct, months) => amount * Math.pow(1 + inflationPct / 100, months / 12)

/**
 * Monthly SIP needed to reach `target` in `months`.
 * corpus: what is already invested toward this goal (it keeps growing at the same rate).
 */
export function requiredSip({ target, corpus = 0, annualPct, months, inflationPct = 0, stepUpPct = 0 }) {
  const adjustedTarget = inflate(target, inflationPct, months)
  const corpusFuture = fvLumpsum(corpus, annualPct, months)
  const gap = Math.max(adjustedTarget - corpusFuture, 0)
  if (gap <= 0) return { sip: 0, adjustedTarget, corpusFuture, gap: 0, months, achieved: true }
  if (months <= 0) return { sip: gap, adjustedTarget, corpusFuture, gap, months, immediate: true }
  const factor = fvSip(1, annualPct, months, stepUpPct)
  return { sip: gap / factor, adjustedTarget, corpusFuture, gap, months }
}

/** One-time investment today that alone would fund the gap. */
export function requiredLumpsum({ target, corpus = 0, annualPct, months, inflationPct = 0 }) {
  const adjustedTarget = inflate(target, inflationPct, months)
  const pvOfTarget = adjustedTarget / Math.pow(1 + monthlyRateEff(annualPct), months)
  return Math.max(pvOfTarget - corpus, 0)
}

/** Where you will land if you keep today's SIP going. */
export function projectGoal({ target, corpus = 0, currentSip = 0, annualPct, months, inflationPct = 0, stepUpPct = 0 }) {
  const adjustedTarget = inflate(target, inflationPct, months)
  const projected = fvLumpsum(corpus, annualPct, months) + fvSip(currentSip, annualPct, months, stepUpPct)
  const fundedPct = adjustedTarget > 0 ? (projected / adjustedTarget) * 100 : 100
  const status = fundedPct >= 99.5 ? 'on_track' : fundedPct >= 85 ? 'close' : 'behind'
  return { adjustedTarget, projected, fundedPct, shortfall: Math.max(adjustedTarget - projected, 0), status }
}

export const STATUS_LABEL = { on_track: 'On track', close: 'Slightly behind', behind: 'Behind', achieved: 'Achieved' }

/** How the required SIP changes across return assumptions - lets the user pick a realistic rate. */
export function rateScenarios(args, rates = [6, 8, 10, 12, 14, 15]) {
  return rates.map((r) => ({ rate: r, ...requiredSip({ ...args, annualPct: r }) }))
}

export function goalMonthsLeft(targetDate, today) {
  if (!targetDate) return 0
  // target_date may be a month (YYYY-MM) or a full date; treat a month as its last day
  const d = targetDate.length === 7 ? `${targetDate}-28` : targetDate
  return monthsUntil(today, d)
}
