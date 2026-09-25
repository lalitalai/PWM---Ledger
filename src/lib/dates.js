// Small, dependency-free date helpers. All dates are ISO strings (YYYY-MM-DD) in the
// household's timezone (India). We never use Date arithmetic across timezones.

export const TZ = 'Asia/Kolkata'

/** Today's date in India as YYYY-MM-DD (works identically on client and server). */
export function todayISO(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

export const pad = (n) => String(n).padStart(2, '0')

export function parseISO(s) {
  const [y, m, d] = s.slice(0, 10).split('-').map(Number)
  return { y, m, d }
}
export const toISO = ({ y, m, d }) => `${y}-${pad(m)}-${pad(d)}`
export const daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate()

/** YYYY-MM of a date */
export const ym = (iso) => iso.slice(0, 7)

/** Add n months to a YYYY-MM string. */
export function shiftMonth(ymStr, n) {
  let [y, m] = ymStr.split('-').map(Number)
  m += n
  while (m < 1) { m += 12; y-- }
  while (m > 12) { m -= 12; y++ }
  return `${y}-${pad(m)}`
}

/** Whole months from YYYY-MM a to YYYY-MM b (b - a). */
export function monthsBetweenYM(a, b) {
  const [ay, am] = a.split('-').map(Number)
  const [by, bm] = b.split('-').map(Number)
  return (by - ay) * 12 + (bm - am)
}

/** The date in `ymStr` for a given day-of-month, clamped to month length (31 -> 30/28/29). */
export function dateInMonth(ymStr, day) {
  const [y, m] = ymStr.split('-').map(Number)
  return toISO({ y, m, d: Math.min(Math.max(1, day), daysInMonth(y, m)) })
}

/**
 * Every monthly occurrence of `day` in the closed interval [from, to] (ISO dates).
 * A day of 31 falls on the last day of shorter months.
 */
export function monthlyDates(day, from, to) {
  if (!from || !to || from > to) return []
  const out = []
  let cur = ym(from)
  const last = ym(to)
  let guard = 0
  while (cur <= last && guard++ < 1200) {
    const d = dateInMonth(cur, day)
    if (d >= from && d <= to) out.push(d)
    cur = shiftMonth(cur, 1)
  }
  return out
}

/** First occurrence of `day` strictly after `afterISO`. */
export function nextOccurrenceAfter(day, afterISO) {
  let cur = ym(afterISO)
  for (let i = 0; i < 3; i++) {
    const d = dateInMonth(cur, day)
    if (d > afterISO) return d
    cur = shiftMonth(cur, 1)
  }
  return dateInMonth(shiftMonth(ym(afterISO), 1), day)
}

/** First occurrence of `day` on or after `fromISO`. */
export function nextOccurrenceOnOrAfter(day, fromISO) {
  const d = dateInMonth(ym(fromISO), day)
  return d >= fromISO ? d : dateInMonth(shiftMonth(ym(fromISO), 1), day)
}

export function addMonthsISO(iso, n) {
  const { d } = parseISO(iso)
  return dateInMonth(shiftMonth(ym(iso), n), d)
}

/** Whole months between two ISO dates, rounded up if a partial month remains. */
export function monthsUntil(fromISO, toISO_) {
  if (!toISO_ || toISO_ <= fromISO) return 0
  const a = parseISO(fromISO), b = parseISO(toISO_)
  let m = (b.y - a.y) * 12 + (b.m - a.m)
  if (b.d > a.d) m += 1
  return Math.max(m, 0)
}

export function daysBetween(aISO, bISO) {
  const a = parseISO(aISO), b = parseISO(bISO)
  return Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / 86400000)
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const monthShort = (ymStr) => MONTHS[Number(ymStr.slice(5, 7)) - 1]
export function monthLabel(ymStr) {
  return `${MONTHS[Number(ymStr.slice(5, 7)) - 1]} ${ymStr.slice(0, 4)}`
}
export function dateLabel(iso) {
  if (!iso) return '—'
  const { y, m, d } = parseISO(iso)
  return `${d} ${MONTHS[m - 1]} ${y}`
}
export function dateShort(iso) {
  if (!iso) return '—'
  const { m, d } = parseISO(iso)
  return `${d} ${MONTHS[m - 1]}`
}
/** Last n months (inclusive of `endYM`) oldest first. */
export function lastMonths(endYM, n) {
  return Array.from({ length: n }, (_, i) => shiftMonth(endYM, i - (n - 1)))
}

/** The calendar day before an ISO date. */
export function dayBefore(iso) { return new Date(Date.parse(iso + 'T00:00:00Z') - 86400000).toISOString().slice(0, 10) }

/** Add n days to an ISO date. */
export function addDaysISO(iso, n) { return new Date(Date.parse(iso + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10) }

/** The 12 YYYY-MM months (Apr -> Mar) of the Indian financial year containing `iso`. */
export function financialYearMonths(iso) {
  const { y, m } = parseISO(iso)
  const startY = m >= 4 ? y : y - 1
  return Array.from({ length: 12 }, (_, i) => shiftMonth(`${startY}-04`, i))
}
/** 'FY 2026-27' label for the financial year containing `iso`. */
export function financialYearLabel(iso) {
  const { y, m } = parseISO(iso)
  const startY = m >= 4 ? y : y - 1
  return `FY ${startY}-${String((startY + 1) % 100).padStart(2, '0')}`
}

/** 'Dec 2043' from an ISO date - for projections where the day of month is not meaningful. */
export const monthYear = (iso) => (iso ? monthLabel(iso.slice(0, 7)) : '—')

/** 1 -> "1st", 22 -> "22nd", 11 -> "11th" */
export function ordinal(n) {
  const v = Number(n), r = v % 100
  if (r >= 11 && r <= 13) return `${v}th`
  return `${v}${{ 1: 'st', 2: 'nd', 3: 'rd' }[v % 10] || 'th'}`
}
