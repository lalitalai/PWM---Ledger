// The "no manual entry" engine: figures out which SIP installments and EMI payments are due
// but not yet recorded. Pure functions - used by the app on open AND by the daily server job.
import { pendingSipRows } from './schedule.js'
import { pendingEmiRows } from './amortization.js'
import { daysBetween } from './dates.js'

/**
 * Give a brand-new installment an approximate NAV/units from the holding's latest price when that
 * price is recent. (The daily server job later replaces it with the exact NAV for the due date.)
 */
export function withApproxNav(rows, sips, holdings, maxDays = 5) {
  const hByid = new Map(holdings.map((h) => [h.id, h]))
  const sByid = new Map(sips.map((s) => [s.id, s]))
  return rows.map((r) => {
    const h = hByid.get(sByid.get(r.sip_id)?.holding_id)
    if (!h || !(Number(h.price) > 0) || !h.price_date) return r
    if (Math.abs(daysBetween(r.due_date, h.price_date)) > maxDays) return r
    return { ...r, nav: Number(h.price), units: Math.round((r.amount / Number(h.price)) * 1e6) / 1e6, nav_date: h.price_date }
  })
}

export function computeAutomation(data, today, { approxNav = true, navMaxDays = 5 } = {}) {
  let sipRows = pendingSipRows(data.sip_master, data.sip_installments, today)
  if (approxNav) sipRows = withApproxNav(sipRows, data.sip_master, data.holdings, navMaxDays)
  const emiRows = pendingEmiRows(data.emi_master, data.emi_payments, data.emi_prepayments, today)
  return { sipRows, emiRows }
}

/** Write whatever is missing. Safe to call any number of times (unique keys + tombstones). */
export async function runAutomation(store, data, today, opts) {
  const { sipRows, emiRows } = computeAutomation(data, today, opts)
  const [sip, emi] = await Promise.all([
    sipRows.length ? store.insertIgnore('sip_installments', sipRows, 'sip_id,due_date') : [],
    emiRows.length ? store.insertIgnore('emi_payments', emiRows, 'emi_id,due_date') : [],
  ])
  return { sip, emi }
}
