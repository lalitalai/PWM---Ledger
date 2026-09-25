// Derived portfolio numbers.
//
// A holding stores a *baseline* (units + invested amount as of `baseline_date`, e.g. the CAS date).
// Everything that happens after that date is layered on top at read time:
//   + paid SIP installments of SIPs linked to the holding
//   + manual "additional investment" (and withdrawal) entries
// This means a CAS import (which resets the baseline) can never double-count SIPs that were
// already auto-posted, and SIPs auto-post without ever editing the holding itself.
import { isUnitBased, assetClassOf } from './constants.js'

const num = (x) => (x == null || x === '' ? 0 : Number(x))

export function deriveHolding(h, { sips = [], installments = [], txns = [] }) {
  const base = h.baseline_date || '0000-00-00'
  const unitBased = isUnitBased(h.asset_type)
  const price = num(h.price)
  const sipIds = new Set(sips.filter((s) => s.holding_id === h.id).map((s) => s.id))
  const flows = []
  for (const i of installments) {
    if (i.status === 'paid' && sipIds.has(i.sip_id) && i.due_date > base) {
      flows.push({ date: i.due_date, amount: num(i.amount), units: i.units, nav: i.nav, kind: 'sip' })
    }
  }
  for (const t of txns) {
    if (t.holding_id === h.id && t.date > base) flows.push({ date: t.date, amount: num(t.amount), units: t.units, nav: t.nav, kind: t.kind })
  }
  flows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))

  const baseInvested = num(h.invested_amount)
  let invested = baseInvested
  let held = num(h.units)
  let pending = 0 // flows we cannot convert to units yet (NAV not fetched) - valued at cost
  for (const f of flows) {
    if (f.kind === 'withdrawal') {
      const u = f.units != null ? num(f.units) : price > 0 ? f.amount / price : null
      if (unitBased && u != null && held > 0) {
        const frac = Math.min(u / held, 1)
        invested -= invested * frac
        held = Math.max(held - u, 0)
      } else {
        invested = Math.max(invested - f.amount, 0)
        if (unitBased) pending -= f.amount
      }
    } else {
      invested += f.amount
      const u = f.units != null ? num(f.units) : f.nav ? f.amount / num(f.nav) : null
      if (unitBased) { if (u != null) held += u; else pending += f.amount }
    }
  }
  let value
  if (unitBased && price > 0) value = Math.max(held * price + pending, 0)
  else value = Math.max((h.current_value != null ? num(h.current_value) : baseInvested) + (invested - baseInvested), 0)

  const costKnown = h.cost_known !== false
  const gain = costKnown ? value - invested : null
  return {
    ...h, units: held, invested, value, pending,
    gain, gainPct: costKnown && invested > 0 ? (gain / invested) * 100 : null,
    assetClass: assetClassOf(h), costKnown,
  }
}

export function deriveHoldings(holdings, ctx) {
  return holdings.filter((h) => h.active !== false).map((h) => deriveHolding(h, ctx))
}

export function portfolioTotals(derived) {
  let value = 0, invested = 0, costKnownValue = 0, costKnownInvested = 0
  for (const h of derived) {
    value += h.value; invested += h.invested
    if (h.costKnown) { costKnownValue += h.value; costKnownInvested += h.invested }
  }
  const gain = costKnownValue - costKnownInvested
  return { value, invested, gain, gainPct: costKnownInvested > 0 ? (gain / costKnownInvested) * 100 : 0, unknownCostValue: value - costKnownValue, costKnownInvested }
}

export function groupSum(derived, keyFn, valFn = (h) => h.value) {
  const m = new Map()
  for (const h of derived) { const k = keyFn(h) || 'Other'; m.set(k, (m.get(k) || 0) + valFn(h)) }
  return [...m.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)
}

/** Holdings that count toward a goal: tagged directly, or fed by a SIP tagged to the goal. */
export function goalHoldings(goalId, derived, sips) {
  const viaSip = new Set(sips.filter((s) => s.goal_id === goalId && s.holding_id).map((s) => s.holding_id))
  return derived.filter((h) => h.goal_id === goalId || viaSip.has(h.id))
}
export function goalCorpus(goal, derived, sips) {
  const hs = goalHoldings(goal.id, derived, sips)
  return { holdings: hs, invested: hs.reduce((t, h) => t + h.value, 0) + num(goal.manual_amount) }
}
export const goalMonthlySip = (goalId, sips) => sips.filter((s) => s.goal_id === goalId && s.active !== false).reduce((t, s) => t + num(s.amount), 0)

/** Money put in per month (SIP + additional), oldest-first for the given YYYY-MM list. */
export function monthlyInvestmentSeries(months, installments, txns) {
  const m = Object.fromEntries(months.map((k) => [k, { month: k, sip: 0, additional: 0 }]))
  for (const i of installments) if (i.status === 'paid') { const r = m[i.due_date.slice(0, 7)]; if (r) r.sip += num(i.amount) }
  for (const t of txns) if (t.kind !== 'withdrawal') { const r = m[t.date.slice(0, 7)]; if (r) r.additional += num(t.amount) }
  return months.map((k) => m[k])
}

export function snapshotOf(derived, date) {
  const totals = portfolioTotals(derived)
  const by = (fn) => Object.fromEntries(groupSum(derived, fn).map((x) => [x.name, Math.round(x.value)]))
  return { date, total_value: Math.round(totals.value), invested: Math.round(totals.invested), by_class: by((h) => h.assetClass), by_person: by((h) => h.person) }
}
