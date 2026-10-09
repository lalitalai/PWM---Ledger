// CSV statement import. Most bank/UPI apps that offer a CSV export use fairly predictable column
// names, so unlike the PDF side this does not need per-source parsers - just a tolerant header
// match and a proper (quote-aware) CSV line splitter.
import { findRef } from './sources/common.js'

function splitCsvLine(line) {
  const out = []
  let cur = '', inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (inQuotes) {
      if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++ } else inQuotes = false }
      else cur += c
    } else if (c === '"') inQuotes = true
    else if (c === ',') { out.push(cur); cur = '' }
    else cur += c
  }
  out.push(cur)
  return out.map((s) => s.trim())
}

function parseCsvText(text) {
  const lines = text.split(/\r\n|\n|\r/).filter((l) => l.trim() !== '')
  return lines.map(splitCsvLine)
}

function findCol(headers, re) {
  const i = headers.findIndex((h) => re.test(h))
  return i === -1 ? null : i
}

function parseDate(s) {
  if (!s) return null
  s = s.trim()
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (m) return `${m[1]}-${String(+m[2]).padStart(2, '0')}-${String(+m[3]).padStart(2, '0')}`
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/)
  if (m) {
    let [, d, mo, y] = m
    y = +y; if (y < 100) y += y < 70 ? 2000 : 1900
    d = +d; mo = +mo
    if (mo > 12 && d <= 12) { [d, mo] = [mo, d] } // some exports are MM/DD/YYYY
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null
    return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  }
  return null
}

function num(s) {
  if (s == null) return 0
  const v = Number(String(s).replace(/[^\d.-]/g, ''))
  return Number.isFinite(v) ? v : 0
}

/**
 * Parse a bank/UPI CSV export into the same candidate-row shape the PDF parsers produce.
 * Recognises either separate Debit/Credit (or Withdrawal/Deposit) columns, or a single Amount
 * column paired with a Dr/Cr (or +/-) type column, or a single signed Amount column on its own.
 */
export function parseStatementCsv(text) {
  const table = parseCsvText(text)
  if (table.length < 2) return { rows: [], error: 'That file does not look like a CSV with a header row.' }
  const headers = table[0].map((h) => h.toLowerCase().trim())
  const dateCol = findCol(headers, /date/)
  const descCol = findCol(headers, /desc|narration|particular|remark|detail|payee|merchant/) ?? findCol(headers, /./)
  const debitCol = findCol(headers, /debit|withdrawal/)
  const creditCol = findCol(headers, /credit|deposit/)
  const amountCol = findCol(headers, /^amount$|^amt$|amount/)
  const typeCol = findCol(headers, /type|dr\/?cr|drcr/)
  const refCol = findCol(headers, /ref|transaction id|txn id|utr/)
  if (dateCol == null) return { rows: [], error: 'No "Date" column was found in the CSV header.' }
  if (debitCol == null && creditCol == null && amountCol == null) return { rows: [], error: 'No Debit/Credit or Amount column was found in the CSV header.' }

  const rows = []
  for (const cols of table.slice(1)) {
    const date = parseDate(cols[dateCol])
    if (!date) continue
    const description = (descCol != null ? cols[descCol] : '') || 'Transaction'
    let amount = 0, direction = 'debit'
    if (debitCol != null || creditCol != null) {
      const d = debitCol != null ? num(cols[debitCol]) : 0
      const c = creditCol != null ? num(cols[creditCol]) : 0
      if (d > 0) { amount = d; direction = 'debit' } else if (c > 0) { amount = c; direction = 'credit' } else continue
    } else {
      const raw = num(cols[amountCol])
      amount = Math.abs(raw)
      if (!(amount > 0)) continue
      if (typeCol != null) direction = /^cr|credit|\+/i.test(cols[typeCol] || '') ? 'credit' : 'debit'
      else direction = raw < 0 ? 'debit' : 'credit'
    }
    if (!(amount > 0)) continue
    const ref = refCol != null && cols[refCol] ? cols[refCol] : findRef(cols.join(' '))
    rows.push({ date, description: String(description).slice(0, 140), amount: Math.round(amount * 100) / 100, direction, ref, categoryHint: null, source: 'CSV' })
  }
  return { rows, error: null }
}
