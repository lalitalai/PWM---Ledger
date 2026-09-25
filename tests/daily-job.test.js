import { describe, it, expect } from 'vitest'
import {
  parseAmfiNav, parseAmfiDate, parseMfapiHistory, navForSip, parseYahooChart, parseYahooSearch, parseGoldApi, fetchAmfiNav,
} from '../api/_lib/prices.js'
import { runHousehold, istToday } from '../api/_lib/job.js'
import { demoStore } from '../src/data/demoStore.js'

// ------------------------------------------------------------------ fixtures
const AMFI_HEAD = `Scheme Code;ISIN Div Payout/ISIN Growth;ISIN Div Reinvestment;Scheme Name;Net Asset Value;Date

Open Ended Schemes(Equity Scheme - Flexi Cap Fund)

PPFAS Mutual Fund

122639;INF879O01027;-;Parag Parikh Flexi Cap Fund - Direct Plan - Growth;85.1234;18-Sep-2026
100001;INF000A01011;INF000A01029;Some Fund - Payout;N.A.;18-Sep-2026
100002;-;-;Broken Date Fund;10.5;not-a-date
`
const bigAmfi = () => AMFI_HEAD + Array.from({ length: 1200 }, (_, i) => `2${String(i).padStart(5, '0')};INF${String(i).padStart(9, '0').replace(/\d/g, 'A')};-;Filler ${i};10.0;18-Sep-2026`).join('\n')

const MFAPI = { meta: { fund_house: 'PPFAS' }, status: 'SUCCESS', data: [
  { date: '18-09-2026', nav: '85.1234' }, { date: '07-09-2026', nav: '84.5000' }, { date: '04-09-2026', nav: '84.0000' }, { date: '03-09-2026', nav: '83.9000' },
  { date: '05-08-2026', nav: '80.0000' }, { date: '04-08-2026', nav: '79.5000' },
] }
const yahoo = (price, currency = 'INR', t = 1789700000) => ({ chart: { result: [{ meta: { regularMarketPrice: price, regularMarketTime: t, gmtoffset: 19800, currency } }] } })

/** fetch stand-in: routes by URL, counts calls */
function fakeFetch(routes) {
  const calls = []
  const f = async (url) => {
    calls.push(String(url))
    for (const [needle, reply] of routes) {
      if (String(url).includes(needle)) {
        if (reply instanceof Error) throw reply
        return { ok: true, status: 200, json: async () => reply, text: async () => reply }
      }
    }
    return { ok: false, status: 404, json: async () => ({}), text: async () => '' }
  }
  f.calls = calls
  return f
}

// in-memory db with the same interface the Supabase adapter offers, backed by the demo store
function memDb(store) {
  const logs = []
  return {
    logs,
    loadAll: () => store.loadAll(),
    insertIgnore: (t, rows, key) => store.insertIgnore(t, rows, key),
    update: (t, id, patch) => store.update(t, id, patch),
    async upsert(t, row, key) {
      const cols = key.split(',')
      const cur = (await store.loadAll())[t].find((r) => cols.every((c) => c === 'household_id' || r[c] === row[c]))
      return cur ? store.update(t, cur.id, row) : store.insert(t, row)
    },
    async log(hh, task, ok, message) { logs.push({ task, ok, message }) },
    async pruneLog() {},
  }
}

const TODAY = '2026-09-20' // a Sunday
async function setup() {
  const store = demoStore({ today: TODAY, persist: false })
  const h = (await store.loadAll()).holdings
  await store.update('holdings', h.find((x) => x.id === 'h-ppfc').id, { isin: 'INF879O01027' })
  return { store, db: memDb(store) }
}
const routes = () => [
  ['amfiindia.com', bigAmfi()], ['api.mfapi.in/mf/122639', MFAPI],
  ['chart/INFY.NS', yahoo(1600.5)], ['chart/GOLDBEES.NS', yahoo(85.25)],
]

// ------------------------------------------------------------------ parsers
describe('price feed parsers', () => {
  it('parses AMFI NAVAll and skips headings, N.A. NAVs and bad dates', () => {
    const { byCode, byIsin } = parseAmfiNav(AMFI_HEAD)
    expect(byCode.size).toBe(1)
    expect(byCode.get('122639')).toEqual({ code: '122639', name: 'Parag Parikh Flexi Cap Fund - Direct Plan - Growth', nav: 85.1234, date: '2026-09-18' })
    expect(byIsin.get('INF879O01027').code).toBe('122639')
  })
  it('maps both ISINs of a scheme to it', () => {
    const { byIsin } = parseAmfiNav('1;INF000A01011;INF000A01029;X Fund;10;01-Jan-2026')
    expect(byIsin.get('INF000A01011').code).toBe('1'); expect(byIsin.get('INF000A01029').code).toBe('1')
  })
  it('parses AMFI dates', () => {
    expect(parseAmfiDate('05-Sep-2026')).toBe('2026-09-05'); expect(parseAmfiDate('5-sep-2026')).toBe('2026-09-05'); expect(parseAmfiDate('05/09/2026')).toBeNull()
  })
  it('sorts mfapi history oldest-first', () => {
    const h = parseMfapiHistory(MFAPI); expect(h[0].date).toBe('2026-08-04'); expect(h.at(-1).date).toBe('2026-09-18')
  })
  it('SIP on a weekend is allotted at the next business day NAV', () => {
    const h = parseMfapiHistory(MFAPI)
    expect(navForSip(h, '2026-09-05')).toEqual({ nav: 84.5, date: '2026-09-07', final: true }) // Saturday -> Monday
    expect(navForSip(h, '2026-09-04')).toEqual({ nav: 84.0, date: '2026-09-04', final: true }) // business day -> same day
  })
  it('falls back to the earlier NAV (not final) when the due-date NAV is not published yet, and gives up when too far', () => {
    const h = parseMfapiHistory(MFAPI)
    expect(navForSip(h, '2026-09-20')).toEqual({ nav: 85.1234, date: '2026-09-18', final: false })
    expect(navForSip(h, '2026-12-25')).toBeNull()
  })
  it('parses Yahoo chart in exchange-local date, search and GoldAPI', () => {
    expect(parseYahooChart(yahoo(1600.5))).toMatchObject({ price: 1600.5, currency: 'INR', date: '2026-09-18' })
    expect(parseYahooChart({ chart: { result: null, error: { code: 'Not Found' } } })).toBeNull()
    expect(parseYahooSearch({ quotes: [{ symbol: 'INFY' }, { symbol: 'INFY.BO' }, { symbol: 'INFY.NS' }] })).toBe('INFY.NS')
    expect(parseYahooSearch({ quotes: [] })).toBeNull()
    expect(parseGoldApi({ price_gram_24k: 14250.4 })).toBe(14250.4); expect(parseGoldApi({})).toBeNull()
  })
  it('rejects a tiny AMFI response (an error page) instead of trusting it', async () => {
    await expect(fetchAmfiNav(fakeFetch([['amfiindia.com', AMFI_HEAD]]))).rejects.toThrow(/AMFI/)
  })
  it('uses India time for "today"', () => {
    expect(istToday(new Date('2026-09-19T20:00:00Z'))).toBe('2026-09-20') // 01:30 IST next day
  })
})

// ------------------------------------------------------------------ the job
describe('daily job', () => {
  it('posts due SIPs/EMIs, refreshes prices, gives instalments exact NAV+units and stores a snapshot', async () => {
    const { store, db } = await setup()
    const shared = {}
    const r = await runHousehold(db, 'demo-household', shared, { today: TODAY, fetchImpl: fakeFetch(routes()) })
    expect(r.ok).toBe(true)
    const d = await store.loadAll()

    expect(d.sip_installments.length).toBeGreaterThan(20)
    expect(d.emi_payments.length).toBeGreaterThan(8)

    const ppfc = d.holdings.find((h) => h.id === 'h-ppfc')
    expect(ppfc.price).toBe(85.1234); expect(ppfc.price_date).toBe('2026-09-18'); expect(ppfc.amfi_code).toBe('122639') // found via ISIN and remembered
    expect(d.holdings.find((h) => h.id === 'h-infy').price).toBe(1600.5)
    expect(d.holdings.find((h) => h.id === 'h-gold').price).toBe(85.25)

    const sept = d.sip_installments.find((i) => i.sip_id === 's-ppfc' && i.due_date === '2026-09-05')
    expect(sept.nav).toBe(84.5); expect(sept.nav_date).toBe('2026-09-07'); expect(sept.units).toBeCloseTo(10000 / 84.5, 5)
    const aug = d.sip_installments.find((i) => i.sip_id === 's-ppfc' && i.due_date === '2026-08-05')
    expect(aug.nav).toBe(80.0); expect(aug.nav_date).toBe('2026-08-05')

    expect(d.portfolio_snapshots.filter((s) => s.date === TODAY)).toHaveLength(1)
    expect(d.portfolio_snapshots.at(-1).total_value).toBeGreaterThan(1e6)
    expect(db.logs.map((l) => l.task)).toEqual(['automation', 'prices', 'sip_nav', 'snapshot'])
  })

  it('is idempotent: a second run changes nothing and does not duplicate the snapshot', async () => {
    const { store, db } = await setup()
    await runHousehold(db, 'hh', {}, { today: TODAY, fetchImpl: fakeFetch(routes()) })
    const before = await store.loadAll()
    const r2 = await runHousehold(db, 'hh', {}, { today: TODAY, fetchImpl: fakeFetch(routes()) })
    const after = await store.loadAll()
    expect(r2.steps[0].message).toBe('Nothing new was due')
    expect(r2.steps[1].message).toMatch(/^0 prices updated/)
    expect(after.sip_installments).toEqual(before.sip_installments)
    expect(after.holdings).toEqual(before.holdings)
    expect(after.portfolio_snapshots).toHaveLength(before.portfolio_snapshots.length)
  })

  it('never re-creates an instalment the user removed (skipped tombstone)', async () => {
    const { store, db } = await setup()
    await runHousehold(db, 'hh', {}, { today: TODAY, fetchImpl: fakeFetch(routes()) })
    const victim = (await store.loadAll()).sip_installments.find((i) => i.sip_id === 's-ppfc' && i.due_date === '2026-07-05')
    await store.update('sip_installments', victim.id, { status: 'skipped' })
    await runHousehold(db, 'hh', {}, { today: TODAY, fetchImpl: fakeFetch(routes()) })
    const rows = (await store.loadAll()).sip_installments.filter((i) => i.sip_id === 's-ppfc' && i.due_date === '2026-07-05')
    expect(rows).toHaveLength(1); expect(rows[0].status).toBe('skipped')
  })

  it('a failing price source is reported but does not stop the other steps', async () => {
    const { store, db } = await setup()
    const f = fakeFetch([['amfiindia.com', new Error('network down')], ['api.mfapi.in/mf/122639', MFAPI], ['chart/', yahoo(1600.5)]])
    // give the fund its code up front so the SIP-NAV step can still work without AMFI
    await store.update('holdings', 'h-ppfc', { amfi_code: '122639' })
    const r = await runHousehold(db, 'hh', {}, { today: TODAY, fetchImpl: f })
    expect(r.steps.map((s) => [s.task, s.ok])).toEqual([['automation', true], ['prices', true], ['sip_nav', true], ['snapshot', true]])
    expect(r.steps[1].message).toMatch(/fund NAVs: AMFI NAV feed unavailable/)   // reported in the message
    const d = await store.loadAll()
    expect(d.sip_installments.find((i) => i.sip_id === 's-ppfc' && i.due_date === '2026-09-05').nav).toBe(84.5)
    expect(d.portfolio_snapshots.length).toBeGreaterThan(0)
  })

  it('reports holdings it cannot price instead of guessing', async () => {
    const { db } = await setup()
    const f = fakeFetch([['amfiindia.com', bigAmfi()], ['chart/', yahoo(1, 'USD')]])
    const r = await runHousehold(db, 'hh', {}, { today: TODAY, fetchImpl: f })
    expect(r.steps[1].message).toMatch(/no price source for/)
  })

  it('prices gold held in grams only when a GoldAPI key is set', async () => {
    const { store, db } = await setup()
    await store.insert('holdings', { name: 'Sovereign Gold Bond', asset_type: 'gold', units: 20, invested_amount: 90000, baseline_date: '2026-01-01', person: 'Joint' })
    const f = fakeFetch([...routes(), ['goldapi.io', { price_gram_24k: 14000.126 }]])
    const noKey = await runHousehold(db, 'hh', {}, { today: TODAY, fetchImpl: f })
    expect(noKey.steps[1].message).toMatch(/GOLDAPI_KEY/)
    const withKey = await runHousehold(db, 'hh', {}, { today: TODAY, fetchImpl: f, goldKey: 'k' })
    expect(withKey.steps[1].message).toMatch(/1 price updated|prices updated/)
    expect((await store.loadAll()).holdings.find((x) => x.name === 'Sovereign Gold Bond').price).toBe(14000.13)
  })
})
