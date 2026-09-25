import { describe, it, expect } from 'vitest'
import { addDaysISO, financialYearMonths, financialYearLabel } from '../src/lib/dates.js'
import { monthCashflow } from '../src/lib/derived.js'
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
