// The daily job for one household. Talks to the database only through the small `db` interface
// (see db.js for the Supabase version; tests use an in-memory one), and to the internet only through `fetchImpl`.
//
//   1. post SIP instalments + EMI payments that fell due       (same pure engine the app runs on open)
//   2. refresh prices: MF NAV (AMFI) / shares + ETFs (Yahoo) / gold (GoldAPI)
//   3. give SIP instalments their real NAV + units             (mfapi.in history)
//   4. store today's portfolio snapshot for the value-over-time chart
//   5. write a line per step to job_log (shown in Settings)
import { computeAutomation } from '../../src/lib/automation.js'
import { buildDerived } from '../../src/lib/derived.js'
import { snapshotOf } from '../../src/lib/portfolio.js'
import { daysBetween } from '../../src/lib/dates.js'
import { fetchAmfiNav, fetchMfHistory, fetchYahooPrice, searchYahooByIsin, fetchGoldGram, navForSip } from './prices.js'

/** Today's date in India (the job runs on UTC servers). */
export const istToday = (now = new Date()) => new Date(now.getTime() + 5.5 * 3600 * 1000).toISOString().slice(0, 10)

const round = (x, dp) => { const f = 10 ** dp; return Math.round(x * f) / f }
const same = (a, b) => (a == null && b == null) || Number(a) === Number(b)

async function pool(items, size, fn) {
  const out = []
  let i = 0
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k], k) }
  }))
  return out
}

/** Run one step; a failure is recorded but never stops the other steps. */
async function step(db, hh, steps, task, fn) {
  try {
    const msg = await fn()
    steps.push({ task, ok: true, message: msg })
    await db.log(hh, task, true, msg).catch(() => {})
  } catch (e) {
    const msg = e?.message || String(e)
    steps.push({ task, ok: false, message: msg })
    await db.log(hh, task, false, msg).catch(() => {})
  }
}

const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`

/**
 * @param shared  cache reused across households in one invocation ({ amfi })
 * @param opts    { today, fetchImpl, goldKey }
 */
export async function runHousehold(db, hh, shared = {}, { today = istToday(), fetchImpl = fetch, goldKey } = {}) {
  const data = await db.loadAll(hh)
  const steps = []

  // 1 ── automation
  await step(db, hh, steps, 'automation', async () => {
    const { sipRows, emiRows } = computeAutomation(data, today, { navMaxDays: 5 })
    const sip = sipRows.length ? await db.insertIgnore('sip_installments', sipRows, 'sip_id,due_date') : []
    const emi = emiRows.length ? await db.insertIgnore('emi_payments', emiRows, 'emi_id,due_date') : []
    data.sip_installments.push(...sip); data.emi_payments.push(...emi)
    return sip.length + emi.length ? `Posted ${plural(sip.length, 'SIP instalment')} and ${plural(emi.length, 'EMI payment')}` : 'Nothing new was due'
  })

  // 2 ── prices
  await step(db, hh, steps, 'prices', async () => {
    const active = data.holdings.filter((h) => h.active !== false)
    const funds = active.filter((h) => h.asset_type === 'mutual_fund')
    const listed = active.filter((h) => h.asset_type === 'equity' || h.asset_type === 'etf')
    const gold = active.filter((h) => h.asset_type === 'gold')
    let updated = 0
    const missing = []
    const notes = []

    const apply = async (h, patch) => {
      const changed = Object.entries(patch).some(([k, v]) => !same(h[k], v) && String(h[k] ?? '') !== String(v ?? ''))
      if (!changed) return false
      await db.update('holdings', h.id, patch)
      Object.assign(h, patch)
      return true
    }

    if (funds.length) {
      try {
        shared.amfi ||= fetchAmfiNav(fetchImpl)
        const { byCode, byIsin } = await shared.amfi
        for (const h of funds) {
          const e = (h.amfi_code && byCode.get(String(h.amfi_code).trim())) || (h.isin && byIsin.get(String(h.isin).trim().toUpperCase()))
          if (!e) { missing.push(h.name); continue }
          const patch = { price: round(e.nav, 4), price_date: e.date }
          if (!h.amfi_code) patch.amfi_code = e.code
          if (await apply(h, patch)) updated++
        }
      } catch (e) { shared.amfi = null; notes.push(`fund NAVs: ${e.message}`) }
    }

    if (listed.length) {
      let failed = 0
      await pool(listed, 4, async (h) => {
        try {
          let symbol = h.ticker
          if (!symbol && h.isin) symbol = await searchYahooByIsin(h.isin, fetchImpl)
          if (!symbol) { missing.push(h.name); return }
          const q = await fetchYahooPrice(symbol, fetchImpl)
          if (!q || (q.currency && q.currency !== 'INR')) { missing.push(h.name); return }
          const patch = { price: round(q.price, 4), price_date: q.date || today }
          if (!h.ticker) patch.ticker = symbol
          if (await apply(h, patch)) updated++
        } catch { failed++ }
      })
      if (failed) notes.push(`${plural(failed, 'share/ETF price')} could not be fetched (Yahoo Finance is unofficial and sometimes refuses)`)
    }

    if (gold.length) {
      if (!goldKey) notes.push('gold: set GOLDAPI_KEY to price gold held in grams')
      else {
        try {
          const g = await fetchGoldGram(goldKey, fetchImpl)
          if (!g) throw new Error('no price in response')
          for (const h of gold) if (await apply(h, { price: round(g, 2), price_date: today })) updated++
        } catch (e) { notes.push(`gold: ${e.message}`) }
      }
    }

    const parts = [`${plural(updated, 'price')} updated`]
    if (missing.length) parts.push(`no price source for ${missing.slice(0, 3).join(', ')}${missing.length > 3 ? ` +${missing.length - 3} more` : ''} (add ISIN / AMFI code / ticker)`)
    parts.push(...notes)
    if (notes.length && !updated) throw new Error(parts.join('; '))
    return parts.join('; ')
  })

  // 3 ── exact NAV + units for SIP instalments
  await step(db, hh, steps, 'sip_nav', async () => {
    const sipToHolding = new Map(data.sip_master.map((s) => [s.id, data.holdings.find((h) => h.id === s.holding_id)]))
    const wanted = data.sip_installments.filter((i) => {
      if (i.status !== 'paid') return false
      const h = sipToHolding.get(i.sip_id)
      if (!h || h.asset_type !== 'mutual_fund' || !h.amfi_code) return false
      if (i.due_date <= (h.baseline_date || '0000-00-00')) return false // already inside the baseline units
      return i.units == null || !i.nav_date || i.nav_date < i.due_date || daysBetween(i.due_date, i.nav_date) > 4 || daysBetween(i.due_date, today) <= 14
    })
    if (!wanted.length) return 'No instalments needed a NAV'
    const codes = [...new Set(wanted.map((i) => String(sipToHolding.get(i.sip_id).amfi_code).trim()))]
    const hist = new Map()
    let failed = 0
    await pool(codes, 4, async (c) => { try { hist.set(c, await fetchMfHistory(c, fetchImpl)) } catch { failed++ } })
    let fixed = 0
    for (const i of wanted) {
      const h = hist.get(String(sipToHolding.get(i.sip_id).amfi_code).trim())
      const hit = h && navForSip(h, i.due_date)
      if (!hit) continue
      const patch = { nav: round(hit.nav, 4), units: round(Number(i.amount) / hit.nav, 6), nav_date: hit.date }
      if (same(i.nav, patch.nav) && same(i.units, patch.units) && i.nav_date === patch.nav_date) continue
      await db.update('sip_installments', i.id, patch)
      Object.assign(i, patch)
      fixed++
    }
    if (failed && !fixed) throw new Error(`NAV history unavailable for ${plural(failed, 'fund')}`)
    return `${plural(fixed, 'instalment')} got their exact NAV and units${failed ? `; ${plural(failed, 'fund')} unavailable` : ''}`
  })

  // 4 ── snapshot
  await step(db, hh, steps, 'snapshot', async () => {
    const derived = buildDerived(data, today)
    if (!derived.holdings.length) return 'No holdings to snapshot'
    const snap = snapshotOf(derived.holdings, today)
    await db.upsert('portfolio_snapshots', { household_id: hh, ...snap }, 'household_id,date')
    return `Portfolio ₹${snap.total_value.toLocaleString('en-IN')} saved for ${today}`
  })

  await db.pruneLog(hh, new Date(Date.now() - 60 * 86400000).toISOString()).catch(() => {})
  const ok = steps.every((s) => s.ok)
  const summary = steps.filter((s) => s.task !== 'snapshot' || !s.ok).map((s) => `${s.ok ? '' : '⚠ '}${s.message}`).join(' · ')
  return { ok, steps, summary }
}
