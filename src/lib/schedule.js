// SIP schedule generation - shared by the app (catch-up on open) and the daily server job.
import { monthlyDates, nextOccurrenceOnOrAfter } from './dates.js'

/**
 * SIP installments that should exist by `today` but do not.
 * The DB has UNIQUE (sip_id, due_date); a row with status 'skipped' is a tombstone that
 * prevents re-creation after the user deletes a missed installment.
 */
export function pendingSipRows(sips, installments, today) {
  const have = new Set(installments.map((i) => `${i.sip_id}|${i.due_date}`))
  const out = []
  for (const s of sips) {
    if (s.active === false) continue
    const to = s.end_date && s.end_date < today ? s.end_date : today
    for (const d of monthlyDates(Number(s.sip_day), s.start_date, to)) {
      if (have.has(`${s.id}|${d}`)) continue
      out.push({ sip_id: s.id, household_id: s.household_id, due_date: d, amount: Number(s.amount), status: 'paid', source: 'auto' })
    }
  }
  return out
}

/** Next installment date for each active SIP (for "coming up" lists). */
export function upcomingSips(sips, today, withinDays = 31) {
  const out = []
  for (const s of sips) {
    if (s.active === false) continue
    const nxt = nextOccurrenceOnOrAfter(Number(s.sip_day), today > s.start_date ? today : s.start_date)
    if (s.end_date && nxt > s.end_date) continue
    out.push({ sip: s, date: nxt })
  }
  out.sort((a, b) => (a.date < b.date ? -1 : 1))
  const limit = new Date(Date.parse(today) + withinDays * 86400000).toISOString().slice(0, 10)
  return out.filter((x) => x.date <= limit)
}

export const monthlySipTotal = (sips) => sips.filter((s) => s.active !== false).reduce((t, s) => t + Number(s.amount || 0), 0)
