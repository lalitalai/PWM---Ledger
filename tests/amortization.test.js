import { describe, it, expect } from 'vitest'
import { pmt, nper, replayLoan, loanSummary, pendingEmiRows } from '../src/lib/amortization.js'

describe('pmt / nper', () => {
  it('matches a textbook EMI', () => {
    // 10L, 9% p.a., 20y  => ~ 8,997.26
    expect(pmt(1_000_000, 9, 240)).toBeCloseTo(8997.26, 1)
  })
  it('handles zero interest', () => {
    expect(pmt(120000, 0, 12)).toBe(10000)
    expect(nper(120000, 0, 10000)).toBe(12)
  })
  it('nper inverts pmt', () => {
    const e = pmt(500000, 10.5, 60)
    expect(nper(500000, 10.5, e)).toBeCloseTo(60, 6)
  })
  it('returns Infinity when EMI cannot cover interest', () => {
    expect(nper(1_000_000, 12, 5000)).toBe(Infinity)
  })
})

const loan = { outstanding_amount: 1_000_000, outstanding_as_of: '2026-01-01', interest_rate: 9, emi_amount: pmt(1_000_000, 9, 240), emi_day: 5 }

describe('replayLoan', () => {
  it('runs the full tenure with a level EMI and closes near zero', () => {
    const r = replayLoan(loan, { today: '2026-01-01' })
    const emis = r.rows.filter((x) => x.type === 'emi')
    expect(emis.length).toBe(240)
    expect(emis[0].date).toBe('2026-01-05')
    expect(emis[239].closing).toBeLessThan(0.01)
    expect(r.closeDate).toBe('2045-12-05')
    // first month interest = 1,000,000 * 0.75%
    expect(emis[0].interest).toBeCloseTo(7500, 4)
  })

  it('treats dates up to today as paid, later as projected', () => {
    const r = replayLoan(loan, { today: '2026-03-05' })
    const paid = r.rows.filter((x) => x.status === 'paid')
    expect(paid.length).toBe(3) // 5 Jan, 5 Feb, 5 Mar
    expect(r.balanceToday).toBeCloseTo(paid[2].closing, 6)
    expect(r.nextDue.date).toBe('2026-04-05')
  })

  it('an extra payment reduces the final payment date and total interest', () => {
    const base = loanSummary(loan, { today: '2026-03-05' })
    const withPre = loanSummary(loan, { today: '2026-03-05', prepayments: [{ date: '2026-02-20', amount: 200_000 }] })
    expect(withPre.remainingMonths).toBeLessThan(base.remainingMonths)
    expect(withPre.closeDate < base.closeDate).toBe(true)
    expect(withPre.monthsSaved).toBeGreaterThan(40)
    expect(withPre.interestSaved).toBeGreaterThan(200_000)
    expect(withPre.prepaid).toBe(200_000)
    // EMI amount itself did not change
    expect(withPre.rows.find((x) => x.type === 'emi').payment).toBeCloseTo(loan.emi_amount, 6)
  })

  it('future (planned) prepayments are flagged planned and do not change balance today', () => {
    const r = replayLoan(loan, { today: '2026-03-05', prepayments: [{ date: '2026-09-10', amount: 100_000 }] })
    const p = r.rows.find((x) => x.type === 'prepay')
    expect(p.status).toBe('planned')
    expect(r.balanceToday).toBeCloseTo(replayLoan(loan, { today: '2026-03-05' }).balanceToday, 6)
  })

  it('a skipped EMI capitalises interest and pushes the end date out', () => {
    const base = replayLoan(loan, { today: '2026-03-05' })
    const r = replayLoan(loan, { today: '2026-03-05', payments: [{ due_date: '2026-02-05', status: 'skipped' }] })
    expect(r.rows.find((x) => x.date === '2026-02-05').type).toBe('missed')
    expect(r.balanceToday).toBeGreaterThan(base.balanceToday)
    expect(r.closeDate >= base.closeDate).toBe(true)
    expect(r.rows.filter((x) => x.type === 'emi').length).toBeGreaterThanOrEqual(240)
  })

  it('last EMI is only the remaining amount', () => {
    const l = { ...loan, outstanding_amount: 25_000, emi_amount: 10_000, interest_rate: 12 }
    const r = replayLoan(l, { today: '2026-01-01' })
    const emis = r.rows.filter((x) => x.type === 'emi')
    expect(emis.length).toBe(3)
    expect(emis[2].payment).toBeLessThan(10_000)
    expect(emis[2].closing).toBeCloseTo(0, 6)
  })

  it('flags a loan whose EMI does not cover interest', () => {
    const r = replayLoan({ ...loan, emi_amount: 5000 }, { today: '2026-01-01', horizon: 50 })
    expect(r.neverCloses).toBe(true)
    expect(r.closeDate).toBeNull()
  })

  it('day 31 lands on the last day of short months', () => {
    const r = replayLoan({ ...loan, emi_day: 31 }, { today: '2026-01-01' })
    expect(r.rows[0].date).toBe('2026-01-31')
    expect(r.rows[1].date).toBe('2026-02-28')
    expect(r.rows[2].date).toBe('2026-03-31')
  })

  it('honours a recorded (edited) payment amount', () => {
    const r = replayLoan(loan, { today: '2026-03-05', payments: [{ due_date: '2026-01-05', amount: 20000, status: 'paid' }] })
    expect(r.rows[0].payment).toBe(20000)
  })
})

describe('pendingEmiRows', () => {
  const emi = { id: 'e1', household_id: 'h', ...loan }
  it('creates a row for every due date up to today that has no record', () => {
    const rows = pendingEmiRows([emi], [], [], '2026-04-10')
    expect(rows.map((r) => r.due_date)).toEqual(['2026-01-05', '2026-02-05', '2026-03-05', '2026-04-05'])
    expect(rows[0].status).toBe('paid')
    expect(rows[0].amount).toBeCloseTo(loan.emi_amount, 2)
  })
  it('is idempotent and respects skipped tombstones', () => {
    const have = [
      { emi_id: 'e1', due_date: '2026-01-05', status: 'paid', amount: loan.emi_amount },
      { emi_id: 'e1', due_date: '2026-02-05', status: 'skipped' },
    ]
    const rows = pendingEmiRows([emi], have, [], '2026-04-10')
    expect(rows.map((r) => r.due_date)).toEqual(['2026-03-05', '2026-04-05'])
  })
  it('does not post after the loan is cleared', () => {
    const closed = { ...emi, outstanding_amount: 15000, emi_amount: 10000, interest_rate: 0 }
    const rows = pendingEmiRows([closed], [], [], '2026-12-31')
    expect(rows.length).toBe(2)
    expect(rows[1].amount).toBe(5000)
  })
  it('stops posting once a prepayment clears the loan', () => {
    const rows = pendingEmiRows([emi], [], [{ emi_id: 'e1', date: '2026-02-10', amount: 2_000_000 }], '2026-06-10')
    expect(rows.map((r) => r.due_date)).toEqual(['2026-01-05', '2026-02-05'])
  })
})
