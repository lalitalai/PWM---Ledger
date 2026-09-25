import { describe, it, expect } from 'vitest'
import { parseStatementLines, guessCategory } from '../src/lib/statement/parse.js'
import { EXPENSE_CATEGORIES } from '../src/lib/constants.js'

const page = (...texts) => ({ lines: texts.map((text) => ({ text })) })

describe('parseStatementLines', () => {
  it('reads a Paytm/GPay style debit line', () => {
    const rows = parseStatementLines([page('12/09/2026  Paid to Zepto Marketplace  UPI Ref 302394821  450.00 Dr')])
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ date: '2026-09-12', amount: 450, direction: 'debit' })
    expect(rows[0].description).toMatch(/Zepto/)
  })

  it('reads a credit line and does not treat it as a debit', () => {
    const rows = parseStatementLines([page('15/09/2026 Received from Infosys Salary Credit 185000.00 Cr')])
    expect(rows).toHaveLength(1)
    expect(rows[0].direction).toBe('credit')
    expect(rows[0].amount).toBe(185000)
  })

  it('picks the transaction amount, not the running balance, on a 3-column bank row', () => {
    const rows = parseStatementLines([page('01-09-2026  UPI-ZEPTO-402@ybl  450.00  0.00  125000.00')])
    expect(rows).toHaveLength(1)
    expect(rows[0].amount).toBe(450)
  })

  it('skips header/noise lines and short fragments', () => {
    const rows = parseStatementLines([page('Date  Description  Debit  Credit  Balance', 'ab', '01/09/2026  Grocery run  1200.00')])
    expect(rows).toHaveLength(1)
    expect(rows[0].amount).toBe(1200)
  })

  it('de-duplicates an identical repeated line (wrapped table rows)', () => {
    const rows = parseStatementLines([page('01/09/2026  Coffee shop  250.00', '01/09/2026  Coffee shop  250.00')])
    expect(rows).toHaveLength(1)
  })

  it('carries the last seen date onto a description-only continuation line', () => {
    const rows = parseStatementLines([page('01/09/2026  Amazon purchase order 402  1999.00')])
    expect(rows[0].date).toBe('2026-09-01')
  })

  it('parses month-name dates', () => {
    const rows = parseStatementLines([page('5 Sep 2026  Swiggy order  650.00 debited')])
    expect(rows[0].date).toBe('2026-09-05')
  })
})

describe('guessCategory', () => {
  it('maps common vendor keywords to an existing category', () => {
    expect(guessCategory('Paid to Zomato Online Ordering', EXPENSE_CATEGORIES)).toBe('Dining')
    expect(guessCategory('BIGBASKET GROCERY ORDER', EXPENSE_CATEGORIES)).toBe('Groceries')
    expect(guessCategory('NETFLIX.COM SUBSCRIPTION', EXPENSE_CATEGORIES)).toBe('Subscriptions')
  })
  it('falls back to Other when nothing matches', () => {
    expect(guessCategory('Some unrecognisable payee XYZ123', EXPENSE_CATEGORIES)).toBe('Other')
  })
})
