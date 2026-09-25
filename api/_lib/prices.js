// Price sources for the daily job. Parsers are pure (unit-tested with fixtures);
// the fetchers take an injectable `fetch` so tests never touch the network.
//
//   Mutual funds : AMFI NAVAll.txt (official, every fund in one file) + mfapi.in (per-fund NAV history)
//   Shares / ETFs: Yahoo Finance chart + search endpoints (unofficial, free, may be rate-limited)
//   Gold (grams) : GoldAPI.io (optional, needs GOLDAPI_KEY)

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 }
const pad = (n) => String(n).padStart(2, '0')

/** '19-Sep-2026' -> '2026-09-19' (null if it is not a date) */
export function parseAmfiDate(s) {
  const m = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/.exec(String(s || '').trim())
  if (!m || !MONTHS[m[2].toLowerCase()]) return null
  return `${m[3]}-${pad(MONTHS[m[2].toLowerCase()])}-${pad(m[1])}`
}
/** '19-09-2026' -> '2026-09-19' (mfapi.in format) */
export function parseDmy(s) {
  const m = /^(\d{1,2})-(\d{1,2})-(\d{4})$/.exec(String(s || '').trim())
  return m ? `${m[3]}-${pad(m[2])}-${pad(m[1])}` : null
}

/**
 * AMFI's NAVAll.txt:  "Scheme Code;ISIN Div Payout/ISIN Growth;ISIN Div Reinvestment;Scheme Name;Net Asset Value;Date"
 * with fund-house / category headings mixed in between. Returns lookups by scheme code and by either ISIN.
 */
export function parseAmfiNav(text) {
  const byCode = new Map()
  const byIsin = new Map()
  for (const raw of String(text || '').split(/\r?\n/)) {
    const p = raw.split(';')
    if (p.length < 6) continue
    const code = p[0].trim()
    if (!/^\d+$/.test(code)) continue
    const nav = Number(p[4])
    const date = parseAmfiDate(p[5])
    if (!(nav > 0) || !date) continue // "N.A." and blank NAVs
    const entry = { code, name: p[3].trim(), nav, date }
    byCode.set(code, entry)
    for (const isin of [p[1], p[2]]) { const i = isin.trim().toUpperCase(); if (/^INF[A-Z0-9]{9}$/.test(i)) byIsin.set(i, entry) }
  }
  return { byCode, byIsin }
}

/** mfapi.in /mf/{code} -> oldest-first [{date:'YYYY-MM-DD', nav}] */
export function parseMfapiHistory(json) {
  const rows = (json?.data || []).map((r) => ({ date: parseDmy(r.date), nav: Number(r.nav) })).filter((r) => r.date && r.nav > 0)
  rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  return rows
}

const dayMs = 86400000
const gapDays = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / dayMs)

/**
 * The NAV a SIP instalment is allotted at: the NAV of the due date, or of the next business day when the
 * due date is a weekend/holiday (that is how AMCs process it). If that NAV is not published yet, fall back
 * to the latest earlier NAV and say so (`final: false`) so a later run can replace it.
 */
export function navForSip(history, dueDate, windowDays = 7) {
  let after = null
  let before = null
  for (const r of history) {
    if (r.date >= dueDate) { after = r; break }
    before = r
  }
  if (after && gapDays(dueDate, after.date) <= windowDays) return { nav: after.nav, date: after.date, final: true }
  if (before && gapDays(before.date, dueDate) <= windowDays) return { nav: before.nav, date: before.date, final: false }
  return null
}

/** Yahoo chart response -> { price, date, currency } (date in the exchange's local calendar) */
export function parseYahooChart(json) {
  const meta = json?.chart?.result?.[0]?.meta
  const price = Number(meta?.regularMarketPrice)
  if (!meta || !(price > 0)) return null
  const t = Number(meta.regularMarketTime)
  const off = Number.isFinite(Number(meta.gmtoffset)) ? Number(meta.gmtoffset) : 19800
  const date = t > 0 ? new Date((t + off) * 1000).toISOString().slice(0, 10) : null
  return { price, date, currency: meta.currency || null }
}

/** Yahoo search response (query = an ISIN) -> best Indian ticker, NSE preferred */
export function parseYahooSearch(json) {
  const q = (json?.quotes || []).filter((x) => typeof x.symbol === 'string')
  const nse = q.find((x) => x.symbol.endsWith('.NS'))
  const bse = q.find((x) => x.symbol.endsWith('.BO'))
  return (nse || bse)?.symbol || null
}

/** GoldAPI.io XAU/INR -> price of one gram of 24k gold in rupees */
export function parseGoldApi(json) {
  const g = Number(json?.price_gram_24k)
  return g > 0 ? g : null
}

// ---------------------------------------------------------------------------- fetchers

const UA = 'Mozilla/5.0 (compatible; TheLedger/1.0; personal finance app)'

async function get(fetchImpl, url, { headers = {}, timeoutMs = 15000, as = 'json' } = {}) {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), timeoutMs)
  try {
    const res = await fetchImpl(url, { headers: { 'User-Agent': UA, Accept: '*/*', ...headers }, signal: ctl.signal, redirect: 'follow' })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return as === 'text' ? await res.text() : await res.json()
  } finally { clearTimeout(timer) }
}

const AMFI_URLS = ['https://www.amfiindia.com/spages/NAVAll.txt', 'https://portal.amfiindia.com/spages/NAVAll.txt']

export async function fetchAmfiNav(fetchImpl = fetch) {
  let last
  for (const url of AMFI_URLS) {
    try {
      const parsed = parseAmfiNav(await get(fetchImpl, url, { as: 'text', timeoutMs: 30000 }))
      if (parsed.byCode.size > 1000) return parsed // a real feed has ~15,000 schemes; anything tiny is an error page
      last = new Error('AMFI feed looked empty')
    } catch (e) { last = e }
  }
  throw new Error(`AMFI NAV feed unavailable (${last?.message})`)
}

export const fetchMfHistory = async (code, fetchImpl = fetch) => parseMfapiHistory(await get(fetchImpl, `https://api.mfapi.in/mf/${encodeURIComponent(code)}`, { timeoutMs: 20000 }))

export const fetchYahooPrice = async (symbol, fetchImpl = fetch) =>
  parseYahooChart(await get(fetchImpl, `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=5d&interval=1d`))

export const searchYahooByIsin = async (isin, fetchImpl = fetch) =>
  parseYahooSearch(await get(fetchImpl, `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(isin)}&quotesCount=6&newsCount=0`))

export const fetchGoldGram = async (apiKey, fetchImpl = fetch) => parseGoldApi(await get(fetchImpl, 'https://www.goldapi.io/api/XAU/INR', { headers: { 'x-access-token': apiKey } }))
