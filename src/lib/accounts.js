// Which bank account / credit card a transaction belongs to. Pure functions, unit-tested.
//
// Statements rarely name your account the way your Banks & cards master does, so matching works on
// the two things that do survive: the last digits of the account/card number, and the bank's name
// (including the 4-letter IFSC/UPI handle banks print in narrations - UTIB, KKBK, ICIC...).

const active = (list) => (list || []).filter((x) => x.active !== false)
const digits = (s) => String(s || '').replace(/\D/g, '')

// Canonical bank keys. Each alias list covers the full name, the short name and the IFSC prefix.
const BANKS = {
  icici: ['icici', 'icic'],
  hdfc: ['hdfc'],
  sbi: ['state bank', 'sbi', 'sbin'],
  axis: ['axis', 'utib'],
  kotak: ['kotak', 'kkbk', 'kmb'],
  union: ['union bank', 'ubin', 'ubi'],
  idfc: ['idfc', 'idfb'],
  yes: ['yes bank', 'yesb'],
  indusind: ['indusind', 'indb'],
  bob: ['bank of baroda', 'barb', 'bob'],
  pnb: ['punjab national', 'punb', 'pnb'],
  canara: ['canara', 'cnrb'],
  au: ['au small', 'aubl'],
  federal: ['federal', 'fdrl'],
  amex: ['american express', 'amex'],
}
const aliasRe = (a) => new RegExp(`(?<![a-z])${a.replace(/ /g, '\\s*')}(?![a-z])`, 'i')

/** Canonical bank key(s) mentioned in a piece of text. */
export function banksIn(text) {
  const t = String(text || '')
  return Object.keys(BANKS).filter((k) => BANKS[k].some((a) => aliasRe(a).test(t)))
}
/** Canonical bank key of an account/card master row (from its bank/issuer name, then its own name). */
export function bankKeyOf(row) {
  return banksIn(`${row.bank_name || ''} ${row.issuing_bank || ''}`)[0] || banksIn(row.name)[0] || null
}

/** The account a new expense for this person most likely came from: their own, else a joint one, else any. */
export function defaultBankFor(person, banks) {
  const list = active(banks)
  return (list.find((b) => b.owner === person) || list.find((b) => b.owner === 'Joint') || list[0])?.id || ''
}

/**
 * Which of your accounts a whole bank statement belongs to, from its first-page text (account number,
 * possibly masked like "XXXXXX3669", and the bank's name). Returns an id only when exactly one
 * account fits - a guess between two accounts is worse than asking.
 */
export function guessStatementBank(text, banks) {
  const list = active(banks).filter((b) => b.last4)
  const t = String(text || '')
  // every account-number-looking run: 6+ characters of digits, possibly with X/* masking in front
  const tails = new Set((t.match(/[0-9Xx*]{2,}\d{4}\b/g) || []).filter((s) => s.length >= 6).map((s) => s.slice(-4)))
  const byNumber = list.filter((b) => tails.has(digits(b.last4).slice(-4)))
  const named = new Set(banksIn(t))
  if (byNumber.length === 1) return byNumber[0].id
  if (byNumber.length > 1) {
    const both = byNumber.filter((b) => named.has(bankKeyOf(b)))
    return both.length === 1 ? both[0].id : ''
  }
  // no number matched: fall back to the bank's name, only if you have exactly one account there
  const byName = active(banks).filter((b) => named.has(bankKeyOf(b)))
  return byName.length === 1 ? byName[0].id : ''
}

/**
 * A single UPI-app row's own account hint ({ bank: 'Kotak Mahindra Bank', last: '8716' } from Google
 * Pay; { bank: 'ICICI Bank', last: '69' } from Paytm, which prints only two digits).
 */
export function matchAccountHint(hint, banks) {
  if (!hint) return ''
  const list = active(banks)
  const key = banksIn(hint.bank)[0]
  const last = digits(hint.last)
  let cands = key ? list.filter((b) => bankKeyOf(b) === key) : list
  if (last) {
    const exact = cands.filter((b) => b.last4 && digits(b.last4).endsWith(last))
    if (exact.length) cands = exact
    else if (!key) return ''
  }
  return cands.length === 1 ? cands[0].id : ''
}

// Bill-payment apps collect through their own bank (CRED's handle is cred.club@axisb, so every CRED
// line says "UTIB"/"AXIS" whatever card is being paid) - in their narrations a bank name says
// nothing about the card's issuer.
const INTERMEDIARY = /\bcred\b|cred\.club|\bcheq\b|billdesk|payu|razorpay|paytm|phonepe|gpay|google ?pay|amazon ?pay|mobikwik/i

/**
 * Which credit card a bill payment settles: a card's last 4 digits in the narration, else the issuer
 * named in it (not when it went through CRED/CheQ/etc., and never the bank the money came out of),
 * else your only credit card. Empty when it can't tell - the person picks.
 * @param opts.fromBank the account the payment was debited from (its bank is not the card issuer)
 */
export function guessCardForPayment(description, cards, { fromBank } = {}) {
  const list = active(cards).filter((c) => (c.kind || 'credit') === 'credit')
  if (!list.length) return ''
  const t = String(description || '')
  const byLast4 = list.filter((c) => c.last4 && new RegExp(`(?<!\\d)${digits(c.last4)}(?!\\d)`).test(t))
  if (byLast4.length === 1) return byLast4[0].id
  if (!INTERMEDIARY.test(t)) {
    const named = new Set(banksIn(t))
    if (fromBank) named.delete(bankKeyOf(fromBank))
    const byIssuer = list.filter((c) => named.has(bankKeyOf(c)))
    if (byIssuer.length === 1) return byIssuer[0].id
  }
  return list.length === 1 ? list[0].id : ''
}
