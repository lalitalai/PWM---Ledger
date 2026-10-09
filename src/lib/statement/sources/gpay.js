// Google Pay transaction history PDF. Each transaction is a 2-3 line block headed by a line like:
//   "01 Sep, 2026  Received from rakesh satpute  ₹23,500"
//   "08:54 AM  UPI Transaction ID: 128828519750"
//   "Paid to ICICI Bank 3669"
// The comma after the month, and the ₹ amount at the end of the headline, are what the old
// generic line-by-line parser's date regex could not match - this is a dedicated parser instead
// of a regex patch because the block also carries the UPI reference number on the following line,
// which the generic parser has no way to attach back to the right row.
import { MONTH_RE, monthNum, toISO, directionFromVerb, findRef, VERB_SPLIT } from './common.js'

const HEADLINE = new RegExp(`^(\\d{1,2})\\s+(${MONTH_RE}),?\\s+(\\d{4})\\s+(.+?)\\s*₹\\s*([\\d,]+(?:\\.\\d{1,2})?)\\s*$`, 'i')

export function parseGpay(pages) {
  const rows = []
  for (const page of pages) {
    const lines = page.lines
    for (let i = 0; i < lines.length; i++) {
      const text = (lines[i].text || '').replace(/\s+/g, ' ').trim()
      const m = text.match(HEADLINE)
      if (!m) continue
      const date = toISO(+m[3], monthNum(m[2]), +m[1])
      if (!date) continue
      const rest = m[4].trim()
      // The statement-period header ("01 September 2026 - 30 September 2026  ₹1,06,038.38  ₹46,125")
      // has the same shape as a transaction headline - it is a date range, not a payment.
      if (/^-\s*\d{1,2}\s+[a-z]+,?\s+\d{4}\b/i.test(rest)) continue
      const direction = directionFromVerb(rest) || (/^received|refund|cashback|added money (to|from)/i.test(rest) ? 'credit' : 'debit')
      const description = rest.replace(VERB_SPLIT, '').trim() || (direction === 'credit' ? 'Credit' : 'Payment')
      const amount = Number(m[5].replace(/,/g, ''))
      if (!(amount > 0)) continue

      // The block's next lines carry the UPI transaction ID and which of your accounts was used
      // ("Paid by Kotak Mahindra Bank 8716" on a payment, "Paid to ICICI Bank 3669" on money received).
      let ref = null, accountHint = null
      for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
        const t = (lines[j].text || '').replace(/\s+/g, ' ').trim()
        if (HEADLINE.test(t)) break // next block started
        const rm = t.match(/(?:UPI\s+)?Transaction\s+ID[:.]?\s*(\d+)/i)
        if (rm && !ref) ref = rm[1]
        const am = t.match(/^(?:Paid|Debited|Credited)\s+(?:by|to|from)\s+(.+?)\s+(\d{4})$/i)
        if (am && !accountHint) accountHint = { bank: am[1], last: am[2] }
      }
      rows.push({ date, description, amount: Math.round(amount * 100) / 100, direction, ref: ref || findRef(text), categoryHint: null, accountHint, source: 'Google Pay' })
    }
  }
  return rows
}
