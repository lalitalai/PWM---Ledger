// Everything the dashboards need, computed once from the raw tables.
import { deriveHoldings, portfolioTotals } from './portfolio.js'
import { loanSummary } from './amortization.js'
import { ym, shiftMonth, lastMonths } from './dates.js'

const num = (x) => Number(x) || 0
const sum = (arr, f) => arr.reduce((t, x) => t + num(f(x)), 0)

export function monthCashflow(data, month) {
  const inMonth = (d) => d.slice(0, 7) === month
  const income = sum(data.income.filter((r) => inMonth(r.date)), (r) => r.amount)
  // "Credit Card Payment" rows settle a balance that was already counted as spend when the
  // purchase itself was logged (accrual, not cash) - so they are excluded here to avoid double counting.
  const expenses = sum(data.expenses.filter((r) => inMonth(r.date) && r.category !== 'Credit Card Payment'), (r) => r.amount)
  const emiPaid = sum(data.emi_payments.filter((p) => p.status === 'paid' && inMonth(p.due_date)), (p) => p.amount)
  const prepaid = sum(data.emi_prepayments.filter((p) => inMonth(p.date)), (p) => p.amount)
  const sip = sum(data.sip_installments.filter((p) => p.status === 'paid' && inMonth(p.due_date)), (p) => p.amount)
  const additional = sum(data.investment_txns.filter((t) => t.kind !== 'withdrawal' && inMonth(t.date)), (t) => t.amount)
  const emi = emiPaid + prepaid
  const invested = sip + additional
  return { month, income, expenses, emi, emiPaid, prepaid, sip, additional, invested, leftover: income - expenses - emi - invested }
}

export function buildDerived(data, today) {
  const sipCtx = { sips: data.sip_master, installments: data.sip_installments, txns: data.investment_txns }
  const holdings = deriveHoldings(data.holdings, sipCtx)
  const totals = portfolioTotals(holdings)

  const loans = data.emi_master.filter((l) => l.active !== false).map((loan) => {
    const payments = data.emi_payments.filter((p) => p.emi_id === loan.id)
    const prepayments = data.emi_prepayments.filter((p) => p.emi_id === loan.id)
    const summary = loanSummary(loan, { payments, prepayments, today })
    return { loan, payments, prepayments, summary, closed: summary.balanceToday <= 0.5 && summary.rows.length > 0 && !summary.nextDue }
  })
  const activeLoans = loans.filter((l) => !l.closed)
  const debt = sum(activeLoans, (l) => l.summary.balanceToday)
  const monthlyEmi = sum(activeLoans, (l) => l.loan.emi_amount)

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
  const vals = months.map((m) => { const c = monthCashflow(data, m); return c.income - c.expenses - c.emiPaid - c.invested })
  return vals.reduce((a, b) => a + b, 0) / vals.length
}
