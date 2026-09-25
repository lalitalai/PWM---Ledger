// Loan maths: EMI, remaining tenure, and a replay engine that walks a loan month by month.
//
// Model
//  * A loan has a *baseline*: `outstanding_amount` as of `outstanding_as_of`. Schedules are built
//    "from now": the first EMI is the first `emi_day` after the baseline date.
//  * Every EMI date up to today is (normally) an auto-posted payment record. A record with
//    status 'skipped' means the EMI was not debited - interest accrues and is capitalised, so
//    the loan runs longer.
//  * Extra payments (prepayments) reduce the balance on their date. The EMI amount stays the
//    same, so the *final payment date moves earlier* - exactly what a lender's "reduce tenure"
//    option does.
//  * Interest is charged monthly on the reducing balance: interest = balance x rate / 12.
import { nextOccurrenceAfter, dateInMonth, shiftMonth, ym, monthlyDates } from './dates.js'

const EPS = 0.005
export const round2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100

/** Standard EMI for a principal, annual rate (%) and tenure in months. */
export function pmt(principal, annualPct, months) {
  const i = annualPct / 1200
  if (!(months > 0)) return principal
  if (i === 0) return principal / months
  return (principal * i) / (1 - Math.pow(1 + i, -months))
}

/** Number of months needed to clear `balance` paying `emi` (Infinity if EMI <= monthly interest). */
export function nper(balance, annualPct, emi) {
  const i = annualPct / 1200
  if (balance <= EPS) return 0
  if (!(emi > 0)) return Infinity
  if (i === 0) return balance / emi
  const x = 1 - (balance * i) / emi
  if (x <= 0) return Infinity
  return -Math.log(x) / Math.log(1 + i)
}

/**
 * Replay a loan.
 * @param loan  { outstanding_amount, outstanding_as_of, interest_rate, emi_amount, emi_day }
 * @param opts  { payments: [{due_date, amount, status}], prepayments: [{date, amount}], today, horizon }
 */
export function replayLoan(loan, { payments = [], prepayments = [], today, horizon = 1200 } = {}) {
  const B0 = Number(loan.outstanding_amount) || 0
  const rate = Number(loan.interest_rate) || 0
  const i = rate / 1200
  const emi = Number(loan.emi_amount) || 0
  const day = Number(loan.emi_day) || 1
  const asOf = loan.outstanding_as_of
  const recs = new Map(payments.map((p) => [p.due_date, p]))
  const pre = prepayments
    .filter((p) => p.date > asOf && Number(p.amount) > 0)
    .map((p) => ({ ...p, amount: Number(p.amount) }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))

  const rows = []
  let balance = B0
  let due = nextOccurrenceAfter(day, asOf)
  let pi = 0
  let emiNo = 0
  let guard = 0

  const doPrepay = (p) => {
    const amt = Math.min(p.amount, balance)
    if (amt <= EPS) return
    const opening = balance
    balance -= amt
    rows.push({
      type: 'prepay', date: p.date, opening, interest: 0, principal: amt, payment: amt, closing: Math.max(balance, 0),
      status: p.date <= today ? 'paid' : 'planned', ref: p.id,
    })
  }

  while (balance > EPS && guard++ < horizon) {
    while (pi < pre.length && pre[pi].date < due) { doPrepay(pre[pi]); pi++ }
    if (balance <= EPS) break
    const opening = balance
    const interest = balance * i
    const rec = recs.get(due)
    emiNo++
    if (rec && rec.status === 'skipped') {
      balance += interest
      rows.push({
        type: 'missed', n: emiNo, date: due, opening, interest, principal: -interest, payment: 0, closing: balance,
        status: due <= today ? 'paid' : 'projected', ref: rec.id,
      })
    } else {
      const wanted = rec && Number(rec.amount) > 0 ? Number(rec.amount) : emi
      const payment = Math.min(wanted, balance + interest)
      const principal = payment - interest
      balance = balance - principal
      rows.push({
        type: 'emi', n: emiNo, date: due, opening, interest, principal, payment, closing: Math.max(balance, 0),
        status: due <= today ? 'paid' : 'projected', ref: rec?.id,
      })
    }
    while (pi < pre.length && pre[pi].date === due) { doPrepay(pre[pi]); pi++ }
    due = dateInMonth(shiftMonth(ym(due), 1), day)
  }

  const neverCloses = balance > EPS
  // Balance today = closing of the last row on/before today (baseline if none)
  let balanceToday = B0
  let interestPaid = 0, principalPaid = 0, interestRemaining = 0, prepaid = 0, remainingMonths = 0
  for (const r of rows) {
    if (r.date <= today) {
      balanceToday = r.closing
      if (r.type !== 'prepay') interestPaid += r.interest
      principalPaid += Math.max(r.principal, 0)
      if (r.type === 'prepay') prepaid += r.payment
    } else {
      if (r.type !== 'prepay') { interestRemaining += r.interest; remainingMonths++ }
    }
  }
  const last = rows[rows.length - 1]
  const nextDue = rows.find((r) => r.type !== 'prepay' && r.date > today) || null
  return {
    rows,
    balanceToday: Math.max(balanceToday, 0),
    closeDate: !neverCloses && last ? last.date : null,
    remainingMonths,
    interestPaid, principalPaid, interestRemaining, prepaid,
    nextDue,
    neverCloses,
  }
}

/** Replay with and without the user's extra payments to show what prepayment saved. */
export function loanSummary(loan, { payments = [], prepayments = [], today } = {}) {
  const actual = replayLoan(loan, { payments, prepayments, today })
  const plain = replayLoan(loan, { payments, prepayments: [], today })
  const monthsSaved = actual.neverCloses || plain.neverCloses ? 0 : Math.max(plain.rows.filter((r) => r.type !== 'prepay').length - actual.rows.filter((r) => r.type !== 'prepay').length, 0)
  const interestSaved = Math.max((plain.interestPaid + plain.interestRemaining) - (actual.interestPaid + actual.interestRemaining), 0)
  const B0 = Number(loan.outstanding_amount) || 0
  return { ...actual, plainCloseDate: plain.closeDate, monthsSaved, interestSaved, baseline: B0 }
}

/**
 * EMI payment records that should exist by `today` but do not yet.
 * Used by both the app (on open) and the daily server job. Idempotent: the DB has a unique
 * (emi_id, due_date), and a skipped record is a tombstone that stops re-creation.
 */
export function pendingEmiRows(emis, payments, prepayments, today) {
  const out = []
  for (const e of emis) {
    if (e.active === false) continue
    const mine = payments.filter((p) => p.emi_id === e.id)
    const pre = prepayments.filter((p) => p.emi_id === e.id)
    const rp = replayLoan(e, { payments: mine, prepayments: pre, today })
    const have = new Set(mine.map((p) => p.due_date))
    for (const r of rp.rows) {
      if (r.type !== 'emi' || r.date > today || have.has(r.date)) continue
      out.push({ emi_id: e.id, household_id: e.household_id, due_date: r.date, amount: round2(r.payment), status: 'paid', source: 'auto' })
    }
  }
  return out
}

export { monthlyDates }
