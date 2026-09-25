// Best-effort line-by-line extraction of debit transactions from a Paytm / GPay transaction
// history PDF, or a bank statement PDF. There is no single layout for these - every bank and app
// prints dates, descriptions and amounts differently - so this never claims certainty: every row
// it finds is meant for the person to review, edit or discard before anything is imported.
//
// Input : pages -> [{ lines: [{ y, x, text, tokens }] }]   (see ../cas/textlines.js)
// Output: candidate rows { date, description, amount, direction } - `direction` is a best guess
//         ('debit' | 'credit') from nearby keywords; amount is always positive.

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 }
const MONTH_RE = '(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*'
const DATE_PATTERNS = [
  { re: /\b(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b/, fmt: 'dmy' },
  { re: /\b(\d{4})[/-](\d{1,2})[/-](\d{1,2})\b/, fmt: 'ymd' },
  { re: new RegExp(`\\b(\\d{1,2})\\s+(${MONTH_RE})'?\\s*(\\d{2,4})\\b`, 'i'), fmt: 'dmonthy' },
]
// Reference/UPI/order numbers look just like amounts (long digit runs) - stripped before scanning
// so they are never mistaken for the transaction amount.
const REF_NOISE_RE = /\b(?:upi\s*ref(?:erence)?\.?|ref\.?\s*no\.?|txn\.?\s*id|transaction\s*id|order\s*id|reference\s*(?:no\.?|number)?)[:.]?\s*[\w/]*/gi
// Tried in order: an explicit decimal (almost always the real amount), then a comma-grouped
// integer, then - only as a last resort - any bare run of digits (capped, so a long reference or
// phone number left over after the strip above is not mistaken for a five-figure transaction).
const AMOUNT_PATTERNS = [
  /(?:₹|rs\.?|inr)?\s*\d[\d,]*\.\d{1,2}\b/gi,
  /(?:₹|rs\.?|inr)?\s*\d{1,3}(?:,\d{2,3})+\b/gi,
  /(?:₹|rs\.?|inr)?\s*\d{3,6}\b/gi,
]
const DEBIT_WORDS = /\b(debited|debit|dr\.?|paid|payment to|sent to|withdrawn|purchase|spent|bought)\b/i
const CREDIT_WORDS = /\b(credited|credit|cr\.?|received|refund(?:ed)?|cashback|reversal|reversed)\b/i
const NOISE_LINE = /^(date|description|details|narration|particulars|txn|transaction|debit|credit|balance|amount|page \d|statement|closing|opening|account|ifsc|branch|total)\b/i

function toISO(m, fmt) {
  let y, mo, d
  if (fmt === 'dmy') { d = +m[1]; mo = +m[2]; y = +m[3] }
  else if (fmt === 'ymd') { y = +m[1]; mo = +m[2]; d = +m[3] }
  else { d = +m[1]; mo = MONTHS[m[2].slice(0, 3).toLowerCase()]; y = +m[3] }
  if (y < 100) y += y < 70 ? 2000 : 1900
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function findDate(text) {
  for (const { re, fmt } of DATE_PATTERNS) {
    const m = text.match(re)
    if (!m) continue
    const iso = toISO(m, fmt)
    if (iso) return { iso, match: m[0], index: m.index }
  }
  return null
}

/** All plausible amounts on the (already cleaned) line, left to right, as { value, text }. Stops at the first pattern that finds anything. */
function findAmounts(text) {
  for (const re of AMOUNT_PATTERNS) {
    const out = []
    re.lastIndex = 0
    let m
    while ((m = re.exec(text))) {
      const numMatch = m[0].match(/[\d,]+\.?\d*/)
      if (!numMatch) continue
      const value = Number(numMatch[0].replace(/,/g, ''))
      if (Number.isFinite(value) && value > 0) out.push({ value, text: m[0].trim() })
    }
    if (out.length) return out
  }
  return []
}

/**
 * Parse the lines of a statement PDF into candidate transactions.
 * @param pages [{ lines: [{ text }] }]
 */
export function parseStatementLines(pages) {
  const rows = []
  let lastDate = null
  for (const page of pages) {
    for (const line of page.lines) {
      const text = (line.text || '').replace(/\s+/g, ' ').trim()
      if (!text || text.length < 6 || NOISE_LINE.test(text)) continue
      const dateHit = findDate(text)
      if (dateHit) lastDate = dateHit.iso
      if (!lastDate) continue

      // Amounts are found on a cleaned copy - the date's own digits and any reference/UPI/order
      // number are stripped first so neither is ever mistaken for the transaction amount.
      let forAmounts = text
      if (dateHit) forAmounts = forAmounts.slice(0, dateHit.index) + ' ' + forAmounts.slice(dateHit.index + dateHit.match.length)
      forAmounts = forAmounts.replace(REF_NOISE_RE, ' ')
      const amounts = findAmounts(forAmounts)
      if (!amounts.length) continue
      // The rightmost number before a trailing "running balance" is usually the transaction amount;
      // when only one number is on the line, that is the amount.
      const amt = amounts.length >= 2 ? amounts[amounts.length - 2] : amounts[0]
      if (!(amt.value > 0) || amt.value > 5_000_000) continue

      const isCredit = CREDIT_WORDS.test(text) && !DEBIT_WORDS.test(text)
      const direction = isCredit ? 'credit' : 'debit'

      // Description: whatever is left after stripping the date and the amount tokens.
      let desc = text
      if (dateHit) desc = desc.slice(0, dateHit.index) + ' ' + desc.slice(dateHit.index + dateHit.match.length)
      for (const a of amounts) desc = desc.split(a.text).join(' ')
      desc = desc.replace(/\b(upi|ref no\.?|txn id|transaction id|imps|neft|rtgs)\b[:.]?/gi, ' ')
        .replace(/[|•_-]{2,}/g, ' ').replace(/\s{2,}/g, ' ').trim().replace(/^[-:.\s]+|[-:.\s]+$/g, '')
      if (!desc || desc.length < 2) desc = direction === 'credit' ? 'Credit' : 'Payment'

      rows.push({ date: dateHit ? dateHit.iso : lastDate, description: desc.slice(0, 120), amount: Math.round(amt.value * 100) / 100, direction })
    }
  }
  // De-duplicate exact repeats a table's wrapped second line sometimes produces
  const seen = new Set()
  return rows.filter((r) => {
    const k = `${r.date}|${r.amount}|${r.description}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

/** Guess an expense category + vendor from the free-text description, using the same words the app already suggests. */
export function guessCategory(description, categories) {
  const d = description.toLowerCase()
  const rules = [
    [/zomato|swiggy|zepto|blinkit|district|dine|restaurant|cafe|food/i, 'Dining'],
    [/amazon|flipkart|myntra|shopping|mall/i, 'Shopping'],
    [/uber|ola|rapido|metro|irctc|fuel|petrol|diesel|fastag/i, 'Transport'],
    [/electricity|water bill|gas bill|broadband|wifi|dth|utility|utilities/i, 'Utilities'],
    [/pharmacy|hospital|clinic|doctor|medical|diagnostic/i, 'Healthcare'],
    [/netflix|prime|hotstar|spotify|subscription/i, 'Subscriptions'],
    [/rent\b/i, 'Housing'],
    [/school|tuition|course|udemy|coursera/i, 'Education'],
    [/insurance|premium/i, 'Insurance'],
    [/grocery|groceries|supermarket|kirana|bigbasket|dmart/i, 'Groceries'],
  ]
  for (const [re, cat] of rules) if (re.test(d) && categories.includes(cat)) return cat
  return 'Other'
}
