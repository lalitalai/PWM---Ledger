// Paytm transaction history PDF. Each transaction is a block headed by a line like:
//   "02 Oct  Paid to Hariom sweets  Tag:  ICICI Bank -  - Rs.200"
//   "7:55 PM"
//   "UPI ID: q972096431@ybl on  # Food  69"
//   "UPI Ref No: 316011459239"
// Two things the old generic parser could not do: the headline date has no year ("02 Oct" - the
// year has to be inferred from the statement's own period header), and the category Paytm already
// assigned ("# Food") is a far better signal than guessing from the free-text description.
import { MONTH_RE, monthNum, toISO, directionFromVerb, findRef, VERB_SPLIT, pageText } from './common.js'

const HEADLINE = new RegExp(`^(\\d{1,2})\\s+(${MONTH_RE})\\s+(.+?)\\s*Rs\\.?\\s*([\\d,]+(?:\\.\\d{1,2})?)\\s*$`, 'i')
const PERIOD_RE = new RegExp(`(\\d{1,2})\\s+(${MONTH_RE})'(\\d{2})\\s*-\\s*(\\d{1,2})\\s+(${MONTH_RE})'(\\d{2})`, 'i')

// Paytm's own "# Tag" category, mapped to this app's expense categories. Unmapped/unknown tags
// are left for the usual keyword-based guess instead of inventing a category that does not exist.
const TAG_MAP = {
  food: 'Dining', dining: 'Dining', groceries: 'Groceries', grocery: 'Groceries', taxi: 'Transport',
  travel: 'Travel', fuel: 'Fuel', shopping: 'Shopping', medical: 'Healthcare', healthcare: 'Healthcare',
  utilities: 'Utilities', recharge: 'Subscriptions', entertainment: 'Entertainment', 'money transfer': 'Other',
  miscellaneous: 'Other', other: 'Other',
}

/** Build a month(1-12) -> full year lookup from the statement's own "1 SEP'26 - 2 OCT'26" period header. */
function yearLookup(pages) {
  for (const page of pages) {
    const m = pageText(page).match(PERIOD_RE)
    if (!m) continue
    const startMo = monthNum(m[2]), startYr = 2000 + (+m[3])
    const endMo = monthNum(m[5]), endYr = 2000 + (+m[6])
    const lookup = {}
    if (startYr === endYr) { for (let mo = 1; mo <= 12; mo++) lookup[mo] = startYr }
    else { for (let mo = 1; mo <= 12; mo++) lookup[mo] = mo >= startMo ? startYr : endYr }
    return lookup
  }
  return null
}

export function parsePaytm(pages) {
  const years = yearLookup(pages)
  const rows = []
  for (const page of pages) {
    const lines = page.lines
    for (let i = 0; i < lines.length; i++) {
      const text = (lines[i].text || '').replace(/\s+/g, ' ').trim()
      const m = text.match(HEADLINE)
      if (!m) continue
      const mo = monthNum(m[2])
      const year = years ? years[mo] : new Date().getFullYear()
      const date = toISO(year, mo, +m[1])
      if (!date) continue
      const rest = m[3].trim()
      const direction = directionFromVerb(rest) || 'debit'
      let description = rest.replace(VERB_SPLIT, '').split(/\bTag:/i)[0].replace(/[-\s]+$/, '').trim()
      if (!description) description = direction === 'credit' ? 'Credit' : 'Payment'
      const amount = Number(m[4].replace(/,/g, ''))
      if (!(amount > 0)) continue

      // The UPI ref and the "# Tag" category live a line or two below the headline, inside the
      // same block (up to the next headline, or 4 lines, whichever comes first).
      let ref = null, categoryHint = null
      for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
        const t = lines[j].text || ''
        if (HEADLINE.test((t || '').replace(/\s+/g, ' ').trim())) break
        const rm = t.match(/UPI\s+Ref\s*No[:.]?\s*(\d+)/i)
        if (rm) ref = rm[1]
        const tm = t.match(/#\s*([A-Za-z][A-Za-z &]*)/)
        if (tm) { const tag = tm[1].trim().toLowerCase(); categoryHint = TAG_MAP[tag] || null }
      }
      rows.push({ date, description, amount: Math.round(amount * 100) / 100, direction, ref: ref || findRef(text), categoryHint, source: 'Paytm' })
    }
  }
  return rows
}
