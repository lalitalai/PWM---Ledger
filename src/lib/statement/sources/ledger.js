// A bank-agnostic parser for the classic two-column ledger table (Withdrawal/Deposit or
// Debit/Credit, with a running Balance) that most Indian bank statements use - plus the simpler
// single "Amount" column with a (Dr)/(Cr) suffix that a few banks (e.g. Union Bank) print instead.
// This is deliberately NOT per-bank code, and it does NOT rely on the table's header text to find
// the debit/credit columns - some banks (seen in practice: an SBI export) draw that header as a
// graphic rather than real text, so there is nothing to read. Instead it looks at where the one
// real amount on each row actually sits and lets the data itself reveal the two columns: collect
// every row's amount x-position, find the one clear gap that splits them into a left group and a
// right group, and - following the universal Indian-statement convention of printing
// Debit/Withdrawal before Credit/Deposit - call the left group debit and the right group credit.
// A statement whose amounts do not separate into two such groups is not this layout; parseLedger
// returns no rows and detect.js moves on to the generic fallback.
import { MONTH_RE, monthNum, toISO, findRef } from './common.js'

const DATE_PATTERNS = [
  { re: /(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/, fmt: 'dmy' },
  { re: new RegExp(`(\\d{1,2})\\s+(${MONTH_RE})\\s+(\\d{2,4})`, 'i'), fmt: 'dmonthy' },
]
const AMOUNT_RE = /^\d[\d,]*\.\d{1,2}$/
const SUFFIX_RE = /([\d,]+\.\d{1,2})\s*\(\s*(dr|cr)\s*\)/i
const HAS_SUFFIX_RE = /\(\s*(dr|cr)\s*\)/i

/** The row-starting date on this line, and the exact substring it matched (so it can be stripped
 *  back out of the description) - only near the start of the line, so a date-shaped number buried
 *  deep in a remarks/narration string is never mistaken for a new row. */
function rowDate(text) {
  for (const { re, fmt } of DATE_PATTERNS) {
    const m = re.exec(text)
    if (!m || m.index > 10) continue
    const iso = fmt === 'dmy' ? toISO(+m[3], +m[2], +m[1]) : toISO(+m[3], monthNum(m[2]), +m[1])
    if (iso) return { iso, match: m[0] }
  }
  return null
}

function cleanDescription(text, dateMatch) {
  return text
    .replace(dateMatch, ' ')
    .replace(/^\s*\d+\s+/, ' ')        // a leading bare "S No." column
    .replace(/[\d,]+\.\d{1,2}/g, ' ')  // the transaction amount and running balance
    .replace(/\s{2,}/g, ' ').trim()
}

/** Every row's single non-balance amount token, in document order, paired with the line it came from. */
function candidateRows(pages) {
  const out = []
  for (const page of pages) {
    for (let i = 0; i < page.lines.length; i++) {
      const line = page.lines[i]
      const dateHit = rowDate(line.text)
      if (!dateHit) continue
      const numeric = (line.tokens || []).filter((t) => AMOUNT_RE.test(t.str.trim()))
      if (!numeric.length) continue
      numeric.sort((a, b) => a.x - b.x)
      const token = numeric.length > 1 ? numeric[numeric.length - 2] : numeric[0] // drop the running balance (rightmost), if any
      if (!token) continue
      out.push({ page, i, line, dateHit, token })
    }
  }
  return out
}

/** The x that separates the debit group from the credit group, or null if the amounts don't split
 *  into two clean groups (i.e. this does not look like a two-column debit/credit table at all). */
function findBoundary(rows) {
  if (rows.length < 4) return null
  const xs = rows.map((r) => r.token.x).sort((a, b) => a - b)
  let gapAt = -1, gap = -1
  for (let i = 1; i < xs.length; i++) { const g = xs[i] - xs[i - 1]; if (g > gap) { gap = g; gapAt = i } }
  if (gap < 20) return null // everything is one column (plus normal rendering jitter) - no second column here
  return (xs[gapAt - 1] + xs[gapAt]) / 2
}

function hasSuffixStyle(pages) {
  let hits = 0
  for (const page of pages) for (const line of page.lines) if (HAS_SUFFIX_RE.test(line.text)) hits++
  return hits >= 2
}

function buildRow({ page, i, line, dateHit, token }, direction) {
  const amount = Number(token.str.replace(/,/g, ''))
  if (!(amount > 0)) return null
  // Absorb continuation lines (wrapped remarks/narration) into the description, but never cross a
  // page boundary - a trailing legend/footer page must not be swallowed into the last real row.
  let desc = line.text
  let j = i + 1
  while (j < page.lines.length && !rowDate(page.lines[j].text) && j < i + 4) { desc += ' ' + page.lines[j].text; j++ }
  const ref = findRef(desc)
  const description = cleanDescription(desc, dateHit.match).slice(0, 140) || (direction === 'credit' ? 'Credit' : 'Payment')
  return { date: dateHit.iso, description, amount: Math.round(amount * 100) / 100, direction, ref, categoryHint: null, source: 'Bank statement' }
}

function parseColumnar(rows, boundary) {
  const rowsOut = []
  for (const r of rows) {
    const direction = r.token.x < boundary ? 'debit' : 'credit'
    const row = buildRow(r, direction)
    if (row) rowsOut.push(row)
  }
  return rowsOut
}

function parseSuffix(pages) {
  const rows = []
  for (const page of pages) {
    for (const line of page.lines) {
      const dateHit = rowDate(line.text)
      if (!dateHit) continue
      const m = line.text.match(SUFFIX_RE)
      if (!m) continue
      const amount = Number(m[1].replace(/,/g, ''))
      if (!(amount > 0)) continue
      const direction = m[2].toLowerCase() === 'cr' ? 'credit' : 'debit'
      const description = cleanDescription(line.text.replace(SUFFIX_RE, ' '), dateHit.match).slice(0, 140) || (direction === 'credit' ? 'Credit' : 'Payment')
      rows.push({ date: dateHit.iso, description, amount: Math.round(amount * 100) / 100, direction, ref: findRef(line.text), categoryHint: null, source: 'Bank statement' })
    }
  }
  return rows
}

export function parseLedger(pages) {
  const rows = candidateRows(pages)
  const boundary = findBoundary(rows)
  if (boundary != null) {
    const out = parseColumnar(rows, boundary)
    if (out.length) return out
  }
  if (hasSuffixStyle(pages)) {
    const out = parseSuffix(pages)
    if (out.length) return out
  }
  return []
}
