// Everything the dashboards need, computed once from the raw tables.
import { deriveHoldings, portfolioTotals } from './portfolio.js'
import { loanSummary } from './amortization.js'
import { ym, shiftMonth, lastMonths } from './dates.js'

const num = (x) => Number(x) || 0
const sum = (arr, f) => arr.reduce((t, x) => t + num(f(x)), 0)

/**
 * @param opts.person  when given, only this person's own rows count (exact match - 'Lalit',
 *   'Sujata' or 'Joint' are each counted separately, never blended). Omitted/undefined = household.
 */
export function monthCashflow(data, month, opts = {}) {
  const { person } = opts
  const inMonth = (d) => d.slice(0, 7) === month
  const match = (p) => !person || p === person
  const emiPersonById = new Map(data.emi_master.map((l) => [l.id, l.person]))
  const sipPersonById = new Map(data.sip_master.map((s) => [s.id, s.person]))
  const sipFundedById = new Map(data.sip_master.map((s) => [s.id, s.funded_by || 'self']))

  const income = sum(data.income.filter((r) => inMonth(r.date) && match(r.person)), (r) => r.amount)
  // "Credit Card Payment" rows settle a balance that was already counted as spend when the
  // purchase itself was logged (accrual, not cash) - so they are excluded here to avoid double counting.
  const expenses = sum(data.expenses.filter((r) => inMonth(r.date) && r.category !== 'Credit Card Payment' && match(r.person)), (r) => r.amount)
  const emiPaid = sum(data.emi_payments.filter((p) => p.status === 'paid' && inMonth(p.due_date) && match(emiPersonById.get(p.emi_id))), (p) => p.amount)
  const prepaid = sum(data.emi_prepayments.filter((p) => inMonth(p.date) && match(emiPersonById.get(p.emi_id))), (p) => p.amount)
  const sipRows = data.sip_installments.filter((p) => p.status === 'paid' && inMonth(p.due_date) && match(sipPersonById.get(p.sip_id)))
  const sip = sum(sipRows, (p) => p.amount)
  // Employer-paid SIPs (e.g. NPS/EPF contributions credited straight from the employer) still
  // count as an investment, but were never cash in hand, so they are kept out of `leftover`.
  const sipEmployer = sum(sipRows.filter((p) => sipFundedById.get(p.sip_id) === 'employer'), (p) => p.amount)
  const sipSelf = sip - sipEmployer
  const additional = sum(data.investment_txns.filter((t) => t.kind !== 'withdrawal' && inMonth(t.date) && match(t.person)), (t) => t.amount)
  const emi = emiPaid + prepaid
  const invested = sip + additional
  const investedSelf = sipSelf + additional
  return { month, income, expenses, emi, emiPaid, prepaid, sip, sipSelf, sipEmployer, additional, invested, investedSelf, leftover: income - expenses - emi - investedSelf }
}

/** The earliest YYYY-MM with any income or expense recorded, or null for a brand-new household. */
export function earliestDataMonth(data) {
  const months = [...data.income.map((r) => r.date.slice(0, 7)), ...data.expenses.map((r) => r.date.slice(0, 7))]
  return months.length ? months.reduce((min, m) => (m < min ? m : min)) : null
}

/**
 * The running balance carried into `month` from every earlier month's leftover - last month's
 * leftover cash becomes this month's opening balance, recursively back to the earliest data.
 * Purely derived (never written to the database), so editing an old entry is always reflected.
 */
export function openingBalance(data, month, opts = {}) {
  const start = earliestDataMonth(data)
  if (!start || start >= month) return 0
  let bal = 0
  for (let m = start; m < month; m = shiftMonth(m, 1)) bal += monthCashflow(data, m, opts).leftover
  return bal
}

export function buildDerived(data, today) {
  const sipCtx = { sips: data.sip_master, installments: data.sip_installments, txns: data.investment_txns }
  const holdingsBase = deriveHoldings(data.holdings, sipCtx)

  const loans = data.emi_master.filter((l) => l.active !== false).map((loan) => {
    const payments = data.emi_payments.filter((p) => p.emi_id === loan.id)
    const prepayments = data.emi_prepayments.filter((p) => p.emi_id === loan.id)
    const summary = loanSummary(loan, { payments, prepayments, today })
    return { loan, payments, prepayments, summary, closed: summary.balanceToday <= 0.5 && summary.rows.length > 0 && !summary.nextDue }
  })
  const activeLoans = loans.filter((l) => !l.closed)
  const debt = sum(activeLoans, (l) => l.summary.balanceToday)
  const monthlyEmi = sum(activeLoans, (l) => l.loan.emi_amount)

  // An asset (e.g. Real Estate) tagged to the loan it secures is worth its net equity for goal
  // progress - gross value minus whatever is still owed against it - never its gross value.
  // Household net worth below still nets ALL debt against ALL assets in aggregate, so it is
  // computed from the gross `totals`, not this per-holding figure (otherwise debt would be
  // subtracted twice for any tagged holding).
  const loanBalanceById = Object.fromEntries(loans.map((l) => [l.loan.id, l.summary.balanceToday]))
  const holdings = holdingsBase.map((h) => {
    const loanBalance = h.secures_loan_id ? (loanBalanceById[h.secures_loan_id] || 0) : 0
    return { ...h, loanBalance, netValue: loanBalance ? Math.max(h.value - loanBalance, 0) : h.value }
  })
  const totals = portfolioTotals(holdings)

  const thisMonth = ym(today)
  const cashflow = lastMonths(thisMonth, 12).map((m) => monthCashflow(data, m))

  return {
    holdings, totals, loans, activeLoans, debt, monthlyEmi,
    netWorth: totals.value - debt,
    thisMonth: cashflow[cashflow.length - 1],
    cashflow,
    maps: {
      bank: Object.fromEntries(data.bank_accounts.map((b) => [b.id, b])),
      card: Object.fromEntries(data.credit_cards.map((c) => [c.id, c])),
      goal: Object.fromEntries(data.goals.map((g) => [g.id, g])),
      holding: Object.fromEntries(holdings.map((h) => [h.id, h])),
      sip: Object.fromEntries(data.sip_master.map((s) => [s.id, s])),
      emi: Object.fromEntries(data.emi_master.map((e) => [e.id, e])),
    },
  }
}

/** Average leftover cash of the last `n` completed months - what can realistically go to prepayment. */
export function avgSurplus(data, today, n = 3) {
  const cur = ym(today)
  const months = Array.from({ length: n }, (_, i) => shiftMonth(cur, -(i + 1))).filter((m) => data.income.some((r) => r.date.slice(0, 7) === m))
  if (!months.length) return null
  // prepayments are a choice, not a fixed outflow, so leave them out of the "what could be freed" figure
  const vals = months.map((m) => { const c = monthCashflow(data, m); return c.income - c.expenses - c.emiPaid - c.investedSelf })
  return vals.reduce((a, b) => a + b, 0) / vals.length
}
