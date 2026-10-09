// Tries each statement layout we understand, most specific first, and falls back to the old
// generic line-by-line scanner if none of them recognise the file. Every parser here is
// conservative - it returns no rows rather than a wrong guess when its own layout is not a match -
// so trying them in sequence is safe: at most one of them will ever produce rows for a given file.
import { parseGpay } from './sources/gpay.js'
import { parsePaytm } from './sources/paytm.js'
import { parseLedger } from './sources/ledger.js'
import { parseStatementLines } from './parse.js'

// A CAS (Consolidated Account Statement - CDSL/NSDL/CAMS/KFintech) is a holdings statement for
// demat/mutual-fund accounts, not a bank/UPI transaction history - it has its own importer under
// Invest. Its "redemption"/"instalment"/"closing balance (units)" lines look enough like a ledger
// table that the generic parsers would otherwise produce nonsense rows from it, so it is
// recognised and rejected up front rather than guessed at.
const CAS_SIGNATURE = /consolidated account statement|cas id\s*:/i

export function detectAndParse(pages) {
  const firstPageText = pages[0]?.lines.map((l) => l.text).join(' ') || ''
  if (CAS_SIGNATURE.test(firstPageText)) return { source: null, rows: [], reason: 'cas' }

  const gpay = parseGpay(pages)
  if (gpay.length) return { source: 'Google Pay', rows: gpay }

  const paytm = parsePaytm(pages)
  if (paytm.length) return { source: 'Paytm', rows: paytm }

  const ledger = parseLedger(pages)
  if (ledger.length) return { source: 'Bank statement', rows: ledger }

  const generic = parseStatementLines(pages)
  return { source: generic.length ? 'Generic' : null, rows: generic }
}
