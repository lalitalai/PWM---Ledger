import { describe, it, expect } from 'vitest'
import { addDaysISO, financialYearMonths, financialYearLabel } from '../src/lib/dates.js'
import { monthCashflow, earliestDataMonth, openingBalance, buildDerived } from '../src/lib/derived.js'
import { emptyData } from '../src/data/tables.js'

describe('addDaysISO', () => {
  it('adds days, rolling over month/year boundaries', () => {
    expect(addDaysISO('2026-09-25', 7)).toBe('2026-10-02')
    expect(addDaysISO('2026-12-28', 5)).toBe('2027-01-02')
  })
})

describe('financial year (Apr - Mar) helpers', () => {
  it('a date in the second half of the calendar year belongs to the FY starting that April', () => {
    const months = financialYearMonths('2026-09-20')
    expect(months[0]).toBe('2026-04')
    expect(months).toHaveLength(12)
    expect(months[11]).toBe('2027-03')
    expect(financialYearLabel('2026-09-20')).toBe('FY 2026-27')
  })
  it('a date in Jan-Mar belongs to the FY that started the previous April', () => {
    const months = financialYearMonths('2027-02-10')
    expect(months[0]).toBe('2026-04')
    expect(months[11]).toBe('2027-03')
    expect(financialYearLabel('2027-02-10')).toBe('FY 2026-27')
  })
})

describe('monthCashflow excludes credit-card-bill settlements from spend', () => {
  it('a "Credit Card Payment" row does not inflate the month\'s expense total (it would double count the original purchase)', () => {
    const data = emptyData()
    data.expenses = [
      { date: '2026-09-05', category: 'Dining', amount: 1000 },
      { date: '2026-09-10', category: 'Credit Card Payment', amount: 9000, settles_card_id: 'cc-1' },
    ]
    const cf = monthCashflow(data, '2026-09')
    expect(cf.expenses).toBe(1000)
  })
})

describe('monthCashflow person scoping', () => {
  const data = emptyData()
  data.income = [{ date: '2026-09-02', person: 'Lalit', amount: 100000 }, { date: '2026-09-03', person: 'Sujata', amount: 80000 }]
  data.expenses = [{ date: '2026-09-05', person: 'Lalit', category: 'Dining', amount: 1000 }, { date: '2026-09-06', person: 'Sujata', category: 'Shopping', amount: 2000 }]

  it('an exact person match counts only that person\'s own rows - never blended with Joint', () => {
    expect(monthCashflow(data, '2026-09', { person: 'Lalit' }).income).toBe(100000)
    expect(monthCashflow(data, '2026-09', { person: 'Lalit' }).expenses).toBe(1000)
    expect(monthCashflow(data, '2026-09', { person: 'Sujata' }).income).toBe(80000)
  })
  it('omitting person gives the household total', () => {
    expect(monthCashflow(data, '2026-09').income).toBe(180000)
  })
})

describe('employer-funded SIPs (EPF/NPS) count as investment but never as a cash outflow', () => {
  const data = emptyData()
  data.sip_master = [{ id: 's-self', person: 'Lalit', funded_by: 'self' }, { id: 's-epf', person: 'Lalit', funded_by: 'employer' }]
  data.sip_installments = [
    { sip_id: 's-self', due_date: '2026-09-05', status: 'paid', amount: 10000 },
    { sip_id: 's-epf', due_date: '2026-09-05', status: 'paid', amount: 4000 },
  ]
  data.income = [{ date: '2026-09-01', person: 'Lalit', amount: 100000 }]

  it('splits sip into self/employer and keeps the total "invested" figure whole', () => {
    const cf = monthCashflow(data, '2026-09')
    expect(cf.sip).toBe(14000)
    expect(cf.sipSelf).toBe(10000)
    expect(cf.sipEmployer).toBe(4000)
    expect(cf.invested).toBe(14000)
    expect(cf.investedSelf).toBe(10000)
  })
  it('leftover (actual cash) only ever deducts the self-funded share', () => {
    const cf = monthCashflow(data, '2026-09')
    expect(cf.leftover).toBe(100000 - 0 - 0 - 10000)
  })
})

describe('earliestDataMonth / openingBalance', () => {
  it('no income or expenses -> no floor, no opening balance', () => {
    expect(earliestDataMonth(emptyData())).toBeNull()
    expect(openingBalance(emptyData(), '2026-09')).toBe(0)
  })
  it('carries every prior month\'s leftover forward, compounding across months', () => {
    const data = emptyData()
    data.income = [{ date: '2026-07-01', person: 'Lalit', amount: 50000 }, { date: '2026-08-01', person: 'Lalit', amount: 50000 }]
    data.expenses = [{ date: '2026-07-05', person: 'Lalit', category: 'Dining', amount: 20000 }, { date: '2026-08-05', person: 'Lalit', category: 'Dining', amount: 10000 }]
    expect(earliestDataMonth(data)).toBe('2026-07')
    // July leftover 30000, August leftover 40000 -> September opens with 70000
    expect(openingBalance(data, '2026-08')).toBe(30000)
    expect(openingBalance(data, '2026-09')).toBe(70000)
  })
})

describe('an asset secures a loan - its net value (not gross) counts toward goals', () => {
  it('buildDerived nets a holding\'s value against the current balance of the loan it secures', () => {
    const data = emptyData()
    data.emi_master = [{ id: 'l-home', name: 'Home Loan', principal: 4000000, interest_rate: 8, tenure_months: 240, emi_amount: 35000, outstanding_amount: 3000000, outstanding_as_of: '2026-09-01', emi_day: 5, active: true }]
    data.holdings = [{ id: 'h-flat', name: 'Flat', asset_type: 'real_estate', current_value: 5000000, invested_amount: 5000000, baseline_date: '2026-01-01', secures_loan_id: 'l-home', active: true }]
    const dv = buildDerived(data, '2026-09-20')
    const flat = dv.holdings.find((h) => h.id === 'h-flat')
    expect(flat.value).toBe(5000000)
    // ~19 days past outstanding_as_of on a home loan - balance barely moves off 3,000,000
    expect(flat.loanBalance).toBeGreaterThan(2_900_000)
    expect(flat.loanBalance).toBeLessThan(3_010_000)
    expect(flat.netValue).toBe(flat.value - flat.loanBalance)
    expect(flat.netValue).toBeLessThan(flat.value)
    // household net worth still nets ALL debt against ALL assets in aggregate - never double-counted via a tagged holding
    expect(dv.netWorth).toBeCloseTo(dv.totals.value - dv.debt, 6)
  })
  it('an untagged holding is unaffected - netValue equals its gross value', () => {
    const data = emptyData()
    data.holdings = [{ id: 'h-fund', name: 'Fund', asset_type: 'mutual_fund', units: 10, price: 100, invested_amount: 1000, baseline_date: '2026-01-01', active: true }]
    const dv = buildDerived(data, '2026-09-20')
    const h = dv.holdings.find((x) => x.id === 'h-fund')
    expect(h.netValue).toBe(h.value)
    expect(h.loanBalance).toBe(0)
  })
})
