// Rule-based "where should this goal's money go" suggestions, driven by the time left.
// This is educational guidance, not personalised investment advice; expected returns are
// editable assumptions (Settings) so they never silently go stale.

export const DEFAULT_ASSUMPTIONS = {
  equity: 12,      // diversified equity / index funds, long-run
  hybrid: 10,      // balanced advantage / multi-asset
  debt: 7,         // short/corporate bond funds
  liquid: 6.5,     // liquid / arbitrage / FDs, pre-tax
  gold: 8,
  ppf: 7.1,        // Govt notified, Jul-Sep 2026 (unchanged); revised quarterly
  ssy: 8.2,        // Sukanya Samriddhi, Jul-Sep 2026
  epf: 8.25,       // check the latest EPFO declaration
  nps: 10,         // blended, depends on equity share
  inflation: 6,
}

const B = (equity, debt, gold) => ({ equity, debt, gold })

/** Suggested asset mix by months to goal (a simple glide path). */
export function allocationFor(months, goalType = 'other') {
  if (goalType === 'emergency') return B(0, 100, 0)
  if (months <= 12) return B(0, 100, 0)
  if (months <= 36) return B(15, 80, 5)
  if (months <= 60) return B(40, 50, 10)
  if (months <= 84) return B(60, 30, 10)
  if (months <= 120) return B(70, 20, 10)
  if (months <= 180) return B(75, 15, 10)
  return B(80, 10, 10)
}

export function blendedReturn(alloc, a = DEFAULT_ASSUMPTIONS) {
  return (alloc.equity * a.equity + alloc.debt * a.debt + alloc.gold * a.gold) / 100
}

export function horizonLabel(months) {
  if (months <= 12) return 'Short term (under 1 year)'
  if (months <= 36) return 'Near term (1-3 years)'
  if (months <= 60) return 'Medium term (3-5 years)'
  if (months <= 120) return 'Long term (5-10 years)'
  return 'Very long term (10+ years)'
}

/** Ranked ideas for where the money could go. */
export function avenuesFor(months, goalType = 'other', a = DEFAULT_ASSUMPTIONS) {
  const alloc = allocationFor(months, goalType)
  const list = []
  const add = (name, cls, risk, ret, why, how) => list.push({ name, cls, risk, ret, why, how })

  if (goalType === 'emergency' || months <= 12) {
    add('Liquid / overnight mutual funds', 'Debt', 'Low', [a.liquid - 0.5, a.liquid + 0.5], 'Next-day redemption, little price swing - the right home for money needed within a year.', 'Any AMC via a direct plan')
    add('Bank FD / recurring deposit', 'Debt', 'Low', [a.liquid, a.liquid + 0.8], 'Certain return; break-penalty is small. Ladder maturities to your due dates.', 'Your bank or small-finance bank (check DICGC cover)')
    add('Arbitrage funds', 'Hybrid', 'Low', [a.liquid, a.liquid + 1], 'Equity-taxed but debt-like risk; useful if you are in a high tax slab.', 'Direct plan of any large AMC')
    add('Sweep-in FD / savings with auto-sweep', 'Debt', 'Low', [a.liquid - 2, a.liquid], 'Keeps the last few months of expenses instantly accessible.', 'Bank account setting')
    return { alloc, list }
  }
  if (months <= 36) {
    add('Short-duration / corporate bond funds', 'Debt', 'Low-Med', [a.debt, a.debt + 1], 'Better than an FD after tax for 2-3 years with modest volatility.', 'Direct growth plans; match fund duration to your goal date')
    add('Banking & PSU debt funds', 'Debt', 'Low-Med', [a.debt - 0.3, a.debt + 0.7], 'High-quality issuers, low credit risk.', 'Direct growth plans')
    add('Post Office time deposit / bank FD ladder', 'Debt', 'Low', [a.liquid, a.liquid + 0.8], 'Certainty for money with a fixed date.', 'Post office or bank')
    add('Balanced advantage / equity-savings fund (small part)', 'Hybrid', 'Medium', [a.hybrid - 1, a.hybrid + 1], 'A 10-15% equity taste; only for the part you can leave for 3 years.', 'Direct growth plan')
    if (goalType === 'education') add('Sukanya Samriddhi Yojana (if for a girl child)', 'Debt', 'Very low', [a.ssy - 0.2, a.ssy], 'Government-notified rate, tax-efficient; lock-in until the child is 18-21.', 'Post office / bank')
    return { alloc, list }
  }
  if (months <= 84) {
    add('Balanced advantage / multi-asset funds', 'Hybrid', 'Medium', [a.hybrid - 1, a.hybrid + 1], 'Automatic equity-debt-gold rebalancing; smoother ride for 3-7 year goals.', 'Direct growth plans; SIP')
    add('Nifty 50 / Sensex index fund', 'Equity', 'Medium-High', [a.equity - 2, a.equity], 'Low-cost core equity. Start reducing exposure 2-3 years before the goal.', 'Direct index fund SIP')
    add('Flexi-cap fund', 'Equity', 'Medium-High', [a.equity - 1, a.equity + 1], 'Manager flexibility across market caps.', 'Direct growth plan')
    add('Short-duration debt fund / PPF', 'Debt', 'Low', [a.debt, a.ppf], 'The stable half of the plan.', 'AMC / bank / post office')
    add('Gold ETF or Sovereign Gold Bond secondary', 'Gold', 'Medium', [a.gold - 2, a.gold + 2], '5-10% hedge against inflation shocks.', 'Demat account - Gold ETF')
    return { alloc, list }
  }
  add('Nifty 50 / Nifty Next 50 index funds', 'Equity', 'Medium-High', [a.equity - 2, a.equity], 'Cheap, diversified compounding for 7+ year money.', 'Direct index fund SIP')
  add('Flexi-cap / large & mid-cap funds', 'Equity', 'High', [a.equity - 1, a.equity + 2], 'Broaden across caps; keep small/mid caps to about a quarter of the equity part.', 'Direct growth plans')
  add('Mid/small-cap index or fund (satellite)', 'Equity', 'High', [a.equity - 1, a.equity + 3], 'Higher upside, deeper falls. Cap at ~20% of the portfolio.', 'Direct growth plan')
  add('PPF', 'Debt', 'Very low', [a.ppf - 0.2, a.ppf], '15-year, government-notified, tax-free at maturity. Ideal debt anchor for long goals.', 'Bank / post office; ₹1.5L a year cap')
  add('EPF / VPF', 'Debt', 'Very low', [a.epf - 0.3, a.epf], 'If you are salaried, extra contribution via VPF is a strong debt allocation.', 'Employer payroll')
  if (goalType === 'retirement' || months > 180) add('NPS (Tier 1)', 'Hybrid', 'Medium', [a.nps - 1, a.nps + 1], 'Low-cost, choose equity share up to 75%; extra tax deduction available under the old regime. Partly locked till 60.', 'Any PoP / eNPS')
  if (goalType === 'education') add('Sukanya Samriddhi Yojana (if for a girl child)', 'Debt', 'Very low', [a.ssy - 0.2, a.ssy], 'Government-notified rate, tax-efficient.', 'Post office / bank')
  add('Gold ETF / SGB', 'Gold', 'Medium', [a.gold - 2, a.gold + 2], '5-10% for diversification.', 'Demat account')
  return { alloc, list }
}

/** Where the next 3 years before the goal should shift. */
export function glidePathNote(months) {
  if (months > 60) return 'From about 3 years before the goal date, move a third of the equity portion into debt each year so a market fall does not derail the target.'
  if (months > 36) return 'Start shifting equity into debt about 2 years before the goal date.'
  return 'Keep money for this goal in low-volatility instruments; avoid equity for the final 2-3 years.'
}
