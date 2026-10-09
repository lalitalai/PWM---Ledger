// Shared helpers for the per-source statement parsers (gpay.js, paytm.js, ledger.js).
// Each source parser is deliberately conservative: it only returns rows when it recognises its
// own layout, and returns an empty array otherwise so detect.js can fall through to the next one.

export const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 }
export const MONTH_RE = '(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*'

export function monthNum(name) { return MONTHS[name.slice(0, 3).toLowerCase()] }

export function toISO(y, mo, d) {
  if (y < 100) y += y < 70 ? 2000 : 1900
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

// Verbs that tell us which way the money moved, shared across UPI-app statements (GPay, Paytm, ...).
export const CREDIT_VERBS = /\b(received from|refund(?:ed)?|cashback|reversal|reversed|added money|deposited|credited)\b/i
export const DEBIT_VERBS = /\b(paid to|sent to|transferred to|payment to|withdrawn|debited|bill paid|recharged?)\b/i

export function directionFromVerb(text) {
  if (CREDIT_VERBS.test(text)) return 'credit'
  if (DEBIT_VERBS.test(text)) return 'debit'
  return null
}

// Strips the leading "Paid to " / "Received from " / etc. off a block's headline so what is left
// is just the payee/description.
export const VERB_SPLIT = /^(received from|paid to|sent to|transferred to|payment to|refund(?:ed)? from|cashback from|added money (?:to|from))\s+/i

// The first long digit run (10-16 digits) in a block of text - UPI reference numbers, transaction
// IDs and order IDs are all printed this way. Used only for duplicate-detection hints: best-effort,
// always reviewed by the person before anything is imported.
export function findRef(text) {
  const m = text.match(/\b\d{10,16}\b/)
  return m ? m[0] : null
}

export function cleanAmount(str) {
  const v = Number(String(str).replace(/[^\d.]/g, ''))
  return Number.isFinite(v) ? v : null
}

/** Join a page's lines back into one plain-text blob, for header/signature sniffing. */
export function pageText(page) {
  return page.lines.map((l) => l.text).join('\n')
}
