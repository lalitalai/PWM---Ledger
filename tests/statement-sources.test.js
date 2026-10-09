import { describe, it, expect } from 'vitest'
import { parseGpay } from '../src/lib/statement/sources/gpay.js'
import { parsePaytm } from '../src/lib/statement/sources/paytm.js'
import { parseLedger } from '../src/lib/statement/sources/ledger.js'
import { parseStatementCsv } from '../src/lib/statement/csv.js'
import { detectAndParse } from '../src/lib/statement/detect.js'

const textPage = (...texts) => ({ lines: texts.map((text) => ({ text })) })

describe('parseGpay (Google Pay transaction history)', () => {
  it('reads a credit block with the UPI transaction id on the next line', () => {
    const rows = parseGpay([textPage(
      '01 Sep, 2026  Received from rakesh satpute  ₹23,500',
      '08:54 AM  UPI Transaction ID: 128828519750',
      'Paid to ICICI Bank 3669',
    )])
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ date: '2026-09-01', amount: 23500, direction: 'credit', ref: '128828519750' })
    expect(rows[0].description).toMatch(/rakesh satpute/i)
  })

  it('reads a debit block and does not pick up the comma as part of the year', () => {
    const rows = parseGpay([textPage('03 Oct, 2026  Paid to Hariom sweets  ₹200.50', '6:10 PM  UPI Transaction ID: 999888777666')])
    expect(rows[0]).toMatchObject({ date: '2026-10-03', amount: 200.5, direction: 'debit' })
    expect(rows[0].description).toMatch(/Hariom sweets/i)
  })

  it('returns nothing for text that is not Google Pay-shaped (lets detect.js move on)', () => {
    expect(parseGpay([textPage('Statement of account', '01/09/2026  Some payment  450.00')])).toEqual([])
  })
})

describe('parsePaytm (Paytm transaction history)', () => {
  const period = "1 SEP'26 - 2 OCT'26  - Rs.8,184.44  + Rs.0"

  it('infers the year from the statement period header for a year-less date, and picks up the # Tag category', () => {
    const rows = parsePaytm([textPage(
      period,
      '02 Oct  Paid to Hariom sweets  Tag:  ICICI Bank -  - Rs.200',
      '7:55 PM',
      'UPI ID: q972096431@ybl on  # Food  69',
      'UPI Ref No: 316011459239',
    )])
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ date: '2026-10-02', amount: 200, direction: 'debit', ref: '316011459239', categoryHint: 'Dining' })
    expect(rows[0].description).toMatch(/Hariom sweets/i)
  })

  it('reads a credit block with no tag/ref lines', () => {
    const rows = parsePaytm([textPage(period, '15 Sep  Received from Rakesh  Rs.500')])
    expect(rows[0]).toMatchObject({ date: '2026-09-15', amount: 500, direction: 'credit', categoryHint: null })
  })

  it('returns nothing without the Paytm block shape', () => {
    expect(parsePaytm([textPage('Statement of account', '01/09/2026  Some payment  450.00')])).toEqual([])
  })
})

describe('parseLedger (generic bank ledger table)', () => {
  // No header row needed - the two columns are found from where the amounts themselves sit.
  // Withdrawal (debit) amounts sit at x=150, Deposit (credit) amounts at x=250, Balance at x=350.
  const creditRow = { text: '2  01.09.2026  23500.00  58304.95', tokens: [
    { x: 0, w: 10, str: '2' }, { x: 40, w: 70, str: '01.09.2026' }, { x: 250, w: 60, str: '23500.00' }, { x: 350, w: 60, str: '58304.95' },
  ] }
  const debitRow = (n, amt, bal) => ({ text: `${n}  0${n}.09.2026  ${amt}  ${bal}`, tokens: [
    { x: 0, w: 10, str: String(n) }, { x: 40, w: 70, str: `0${n}.09.2026` }, { x: 150, w: 60, str: amt }, { x: 350, w: 60, str: bal },
  ] })
  const continuation = { text: 'UPI/RAKESH RAG/rakeshsatpute7/September/HDFC BANK/128828519750/ref', tokens: [] }
  const legendPage2 = { text: 'RCHG - Recharge  DTAX - Direct Tax', tokens: [{ x: 0, w: 10, str: 'RCHG' }] }

  it('classifies withdrawal vs deposit by column x-position, not by order on the line', () => {
    const rows = parseLedger([{ lines: [creditRow, continuation, debitRow(3, '1200.00', '57104.95'), debitRow(4, '300.00', '56804.95'), debitRow(5, '80.00', '56724.95')] }])
    expect(rows).toHaveLength(4)
    expect(rows[0]).toMatchObject({ date: '2026-09-01', amount: 23500, direction: 'credit' })
    expect(rows[0].ref).toBe('128828519750') // absorbed from the continuation line
    expect(rows[1]).toMatchObject({ date: '2026-09-03', amount: 1200, direction: 'debit' })
  })

  it('never absorbs a trailing page (e.g. a narration-code legend) into the last row on the page before it', () => {
    const rows = parseLedger([{ lines: [creditRow, debitRow(3, '1200.00', '57104.95'), debitRow(4, '300.00', '56804.95'), debitRow(5, '80.00', '56724.95')] }, { lines: [legendPage2] }])
    expect(rows).toHaveLength(4)
    expect(rows[0].description).not.toMatch(/RCHG/)
  })

  it('falls back to the single-Amount-with-(Dr)/(Cr)-suffix layout when there is no Withdrawal/Deposit header', () => {
    const rows = parseLedger([{ lines: [
      { text: 'Date  Remarks  Amount( )', tokens: [] },
      { text: '03-10-2026  UPIAR/627676632626/DR/LALIT AN/ICIC/rahu  10000.00(Dr)', tokens: [] },
      { text: '03-10-2026  UPIAB/627640326728/CR/LALIT AN/KKBK/rahu  10000.00(Cr)', tokens: [] },
    ] }])
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ amount: 10000, direction: 'debit', ref: '627676632626' })
    expect(rows[1]).toMatchObject({ amount: 10000, direction: 'credit', ref: '627640326728' })
  })

  it('returns nothing when neither table shape is recognised', () => {
    expect(parseLedger([{ lines: [{ text: 'Not a statement at all', tokens: [] }] }])).toEqual([])
  })
})

describe('parseStatementCsv', () => {
  it('reads separate Debit/Credit columns', () => {
    const csv = 'Date,Description,Debit,Credit\n01/09/2026,Zepto order,450.00,\n02/09/2026,Salary,,185000.00\n'
    const { rows, error } = parseStatementCsv(csv)
    expect(error).toBeNull()
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ date: '2026-09-01', amount: 450, direction: 'debit' })
    expect(rows[1]).toMatchObject({ date: '2026-09-02', amount: 185000, direction: 'credit' })
  })

  it('reads a single signed Amount column with a Dr/Cr type column', () => {
    const csv = 'Date,Narration,Amount,Type\n2026-09-01,Zepto order,450.00,DR\n2026-09-02,Salary,185000.00,CR\n'
    const { rows } = parseStatementCsv(csv)
    expect(rows[0].direction).toBe('debit'); expect(rows[1].direction).toBe('credit')
  })

  it('reports a clear error when it cannot find the columns it needs', () => {
    const { rows, error } = parseStatementCsv('Foo,Bar\n1,2\n')
    expect(rows).toEqual([])
    expect(error).toMatch(/date/i)
  })
})

describe('detectAndParse dispatcher', () => {
  it('prefers the Google Pay parser over the generic fallback when both could match', () => {
    const { source, rows } = detectAndParse([textPage('01 Sep, 2026  Received from X  ₹100')])
    expect(source).toBe('Google Pay')
    expect(rows).toHaveLength(1)
  })
  it('falls all the way back to the generic parser for an unrecognised layout', () => {
    const { source, rows } = detectAndParse([textPage('01/09/2026  Grocery run  1200.00')])
    expect(source).toBe('Generic')
    expect(rows).toHaveLength(1)
  })
  it('reports no source when nothing at all is found', () => {
    const { source, rows } = detectAndParse([textPage('Nothing useful here')])
    expect(source).toBeNull(); expect(rows).toEqual([])
  })

  it('recognises a CAS (holdings) statement and declines rather than inventing expense rows from it', () => {
    const { source, rows, reason } = detectAndParse([textPage(
      'CONSOLIDATED ACCOUNT STATEMENT (CAS) FOR SECURITIES HELD IN DEMAT',
      '01.09.2026  Redemption of units  3999.80',
    )])
    expect(source).toBeNull(); expect(rows).toEqual([]); expect(reason).toBe('cas')
  })
})
