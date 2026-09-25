import { describe, it, expect } from 'vitest'
import { itemsToLines } from '../src/lib/cas/textlines.js'
import { parseCas, casToHoldingRows } from '../src/lib/cas/parser.js'
import { inferFundCategory } from '../src/lib/cas/categorize.js'

// ---- tiny fixture builder: mimics the geometry of a CDSL CAS (all data is invented) ----
const tok = (x, str, w = str.length * 4.6) => ({ x, str, w })
const line = (y, ...toks) => {
  const tokens = toks.map(([x, s]) => tok(x, s))
  return { y, x: tokens[0].x, text: tokens.map((t) => t.str).join('  '), tokens }
}
const banner = () => [line(738, [86, 'CONSOLIDATED ACCOUNT STATEMENT (CAS) FOR SECURITIES HELD IN DEMAT']), line(674, [25, 'TEST HOLDER ONE'])]

const dematPage = () => ({ lines: [
  ...banner(),
  line(380, [211, 'DEMAT ACCOUNTS HELD WITH CDSL']),
  line(352, [20, 'DP Name : ACME BROKING LIMITED'], [400, 'BO ID : 1234567800001111']),
  line(332, [201, 'HOLDING STATEMENT AS ON 31-08-2026']),
  line(288, [51, 'ISIN'], [152, 'Security'], [387, 'Setup'], [432, 'Free Bal'], [533, 'Value (`)']),
  line(284, [260, 'Bal'], [308, 'Bal']),
  line(259, [102, 'ALPHA INDUSTRIES LIMITED #']),
  line(254, [22, 'INE000A01011'], [265, '10.000'], [327, '--'], [367, '--'], [417, '--'], [445, '10.000'], [485, '150.0000'], [538, '1,500.00']),
  line(250, [102, 'EQUITY SHARES']),
  line(236, [102, 'BETA HOLDINGS']),
  line(231, [22, 'INE000B01012'], [102, 'CO. LTD. - NEW EQUITY SHARES'], [260, '200.000'], [327, '--'], [367, '--'], [417, '--'], [440, '200.000'], [490, '12.5000'], [538, '2,500.00']),
  line(213, [102, 'OF RE.1/- AFTER SPLIT']),
  line(190, [102, 'ACME AMC LTD#ACME MF-ACME']),
  line(185, [22, 'INF000C01013'], [260, '5.000'], [327, '--'], [367, '--'], [417, '--'], [440, '5.000'], [490, '100.0000'], [538, '500.00']),
  line(171, [102, 'NIFTY 50 ETF']),
  line(100, [23, 'Portfolio Value ` 4,500.00 as on 31-08-2026']),
] })

const mfPage = (joint) => ({ lines: [
  ...banner(),
  ...(joint ? [line(665, [25, `Joint A/C Holder: ${joint}`])] : []),
  line(343, [188, 'MUTUAL FUND UNITS HELD AS ON 31-08-2026']),
  line(306, [32, 'Scheme Name'], [110, 'ISIN'], [180, 'Folio No.'], [250, 'Bal'], [300, 'NAV (`)'], [400, 'Valuation (`)']),
  line(297, [250, '(Units)'], [380, 'Loss(%)']),
  line(278, [22, 'ABC - Alpha Flexi']),
  line(269, [22, 'Cap Fund Direct'], [112, 'INF000D01014'], [190, '9988/1'], [280, '10.5'], [330, '100'], [400, '900.00'], [470, '1,050.00'], [520, '150.00'], [560, '16.67']),
  line(260, [22, 'Growth']),
  line(246, [22, 'XYZ - Beta Liquid Fund']),
  line(237, [112, 'INF000E01015'], [190, '7766'], [280, '0'], [330, '1000.5'], [400, '0.00'], [470, '0.00'], [520, '0.00'], [560, '0.00']),
  line(228, [22, 'Growth']),
  line(200, [22, 'Grand Total'], [400, '900.00'], [470, '1,050.00']),
] })

const txnPage = () => ({ lines: [
  ...banner(),
  line(640, [211, 'MUTUAL FUND UNITS HELD WITH MF/RTA']),
  line(634, [27, 'ABC - Alpha Flexi Cap Fund Direct Growth']),
  line(620, [26, 'ISIN : INF000D01014'], [300, 'UCC :']),
  line(596, [39, 'Date'], [130, 'Transaction Description'], [280, 'Amount (`)']),
  line(570, [77, 'Opening Balance'], [400, '0']),
  line(557, [77, 'SIP Purchase-NSE -']),
  line(548, [27, '05-08-2026'], [77, 'Instalment No - 1 Online'], [260, '4999.75'], [320, '100'], [370, '100'], [420, '49.9975'], [470, '.25'], [510, '0'], [540, '0']),
  line(539, [77, '1234567']),
  line(520, [77, 'Closing Balance'], [420, '49.9975']),
  line(500, [27, 'XYZ - Beta Liquid Fund']),
  line(490, [26, 'ISIN : INF000E01015'], [300, 'UCC :']),
  line(470, [77, 'Opening Balance'], [400, '1500.5']),
  line(457, [27, '19-08-2026'], [77, 'Redemption 998877'], [260, '-500.00'], [320, '1'], [370, '1'], [420, '-500'], [470, '0'], [510, '0'], [540, '0']),
] })

describe('parseCas (CDSL layout, synthetic fixture)', () => {
  const pages = [dematPage(), txnPage(), mfPage(), mfPage('OTHER PERSON')]
  // make the last page's row a different ISIN so keys differ
  const swap = (a, b) => pages[3].lines.forEach((l) => { l.tokens.forEach((t) => { if (t.str === a) t.str = b }); l.text = l.text.replace(a, b) })
  swap('INF000D01014', 'INF000F01016'); swap('INF000E01015', 'INF000G01017')
  const r = parseCas(pages)

  it('reads the statement date', () => { expect(r.statementDate).toBe('2026-08-31') })

  it('parses demat holdings with wrapped names, ETF detection and clean names', () => {
    expect(r.demat.map((d) => [d.isin, d.units, d.price, d.value])).toEqual([
      ['INE000A01011', 10, 150, 1500], ['INE000B01012', 200, 12.5, 2500], ['INF000C01013', 5, 100, 500],
    ])
    expect(r.demat[0].name).toBe('ALPHA INDUSTRIES LIMITED')
    expect(r.demat[1].name).toBe('BETA HOLDINGS CO. LTD.')
    expect(r.demat[2].name).toBe('ACME NIFTY 50 ETF')
    expect(r.demat[2].asset_type).toBe('etf')
    expect(r.demat[0].dp_name).toBe('ACME BROKING LIMITED'); expect(r.demat[0].dp_ref).toBe('1111')
    expect(r.demat.every((d) => d.cost_known === false)).toBe(true)
  })

  it('parses MF holdings: units, NAV, cost, value and multi-line scheme names', () => {
    const a = r.mfHoldings[0]
    expect(a).toMatchObject({ isin: 'INF000D01014', folio_no: '9988/1', units: 10.5, price: 100, invested: 900, value: 1050, cost_known: true, rta_code: 'ABC' })
    expect(a.name).toBe('Alpha Flexi Cap Fund Direct Growth')
    expect(r.mfHoldings[1].name).toBe('Beta Liquid Fund Growth')
    expect(r.mfHoldings[1].units).toBe(0)
  })

  it('tags rows on a joint-holder page', () => {
    const j = r.mfHoldings.filter((h) => h.joint_with)
    expect(j.length).toBe(2)
    expect(j[0].joint_with).toBe('OTHER PERSON')
    expect(r.mfHoldings[0].joint_with).toBeNull()
  })

  it('reconciles with the totals printed in the statement', () => {
    const c = r.checks.find((x) => x.label.startsWith('Demat'))
    expect(c.ok).toBe(true); expect(c.expected).toBe(4500)
    expect(r.checks.find((x) => x.label.startsWith('Mutual'))).toBeTruthy()
  })

  it('reads transactions and infers the SIP (gross of stamp duty)', () => {
    expect(r.transactions).toHaveLength(2)
    expect(r.transactions[0]).toMatchObject({ date: '2026-08-05', isin: 'INF000D01014', amount: 4999.75, units: 49.9975 })
    expect(r.transactions[0].description).toMatch(/SIP Purchase/)
    expect(r.sipCandidates).toEqual([{ isin: 'INF000D01014', name: 'Alpha Flexi Cap Fund Direct Growth', folio_no: '9988/1', amount: 5000, sip_day: 5, last_date: '2026-08-05' }])
  })

  it('never returns PAN / e-mail / address style fields', () => {
    const blob = JSON.stringify(r)
    expect(blob).not.toMatch(/PAN|@|Nominee|Mobile/i)
  })

  it('flags a file that is not a CAS', () => {
    const bad = parseCas([{ lines: [line(700, [20, 'Some random PDF'])] }])
    expect(bad.ok).toBe(false); expect(bad.warnings.length).toBe(1)
  })

  it('casToHoldingRows builds stable, distinct keys', () => {
    const rows = casToHoldingRows(r)
    expect(new Set(rows.map((x) => x.key)).size).toBe(rows.length)
    expect(rows[0].key).toBe('mf|INF000D01014|9988/1')
  })
})

describe('itemsToLines', () => {
  const it_ = (str, x, y, w) => ({ str, width: w, transform: [1, 0, 0, 1, x, y] })
  it('joins items on a baseline in reading order and drops the Hindi twin drawn on top', () => {
    const items = [
      it_('DP Name :', 20, 352, 47), it_(' ', 67, 352, 2), it_('ACME LTD', 70, 352, 60),
      it_('DP का नाम:', 20, 352, 56), it_('ACME LTD', 78, 352, 60), // twin
      it_('BO ID :', 400, 352, 33), it_('1234', 435, 352, 30), it_('BO ID:', 400, 352, 34), it_('1234', 436, 352, 30),
      it_('Next line', 20, 300, 40),
    ]
    const lines = itemsToLines(items)
    expect(lines.map((l) => l.text)).toEqual(['DP Name : ACME LTD  BO ID : 1234', 'Next line'])
  })
})

describe('inferFundCategory', () => {
  it.each([
    ['HDFC Liquid Fund - Direct', 'Liquid'], ['Kotak Gold Fund', 'Gold Fund / ETF'], ['Parag Parikh Flexi Cap Fund', 'Flexi Cap'],
    ['Nippon India Small Cap Fund', 'Small Cap'], ['Motilal Nifty Midcap 150 Momentum 50 Index Fund', 'Index Fund - Mid/Small'],
    ['UTI Nifty 50 Index Fund', 'Index Fund - Large Cap'], ['ICICI Pru Multi-Asset Fund', 'Multi Asset'], ['Axis ELSS Tax Saver', 'ELSS (Tax Saver)'],
    ['Bajaj Banking and PSU Debt Fund', 'Banking & PSU Debt'], ['Kotak Arbitrage Fund', 'Arbitrage'], ['Invesco Large & Mid Cap', 'Large & Mid Cap'],
  ])('%s -> %s', (name, cat) => { expect(inferFundCategory(name)).toBe(cat) })
})
