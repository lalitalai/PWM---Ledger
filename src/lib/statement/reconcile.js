// Reconcile parsed statement rows against what the app ALREADY tracks, so a statement import never
// double-counts money that isn't a new expense:
//
//   - a SIP debit (NACH/ACH mandate) that the SIP master already auto-posted as an instalment,
//   - an EMI debit that the loan master already auto-posted,
//   - a transfer to a broker / fund house that was already typed in as an additional investment,
//   - an expense that was already typed in by hand (same amount, same day),
//   - and - even when nothing is recorded yet - money that by its nature is not spending:
//     investments (broker, mutual fund, NPS/APY/PPF), loan EMIs, credit-card bill payments (the card
//     purchases themselves are the spend) and transfers between the household's own accounts.
//
// Pure function: rows in, rows out, each debit row gaining an optional `match`
//   { kind: 'sip'|'emi'|'investment'|'expense'|'card_payment'|'transfer', recorded: boolean, label }
// `recorded: true` means "this exact money is already in the app" (a real duplicate);
// `recorded: false` means "this isn't an expense, but nothing in the app records it yet" - the label
// then says where it belongs instead. Nothing is decided for the person: the UI unticks these rows
// and shows why, and they can tick any of them back.
import { daysBetween } from '../dates.js'

const AMOUNT_TOL = 1      // rupees - NACH debits are exact, this only absorbs paise rounding
const WINDOW_DAYS = 5     // a SIP/EMI dated the 5th is often debited on the 6th-8th (holidays, T+1)

// Order matters: the first pattern that matches decides the kind.
const KEYWORDS = [
  { kind: 'card_payment', re: /\b(cred\b|cred ?club|cred\.club|cheq\b|credit ?card ?(bill|payment|pmt)|cc ?(bill|payment)|card ?bill|amex|sbi ?card|sbicard)/i,
    label: 'Credit-card bill payment - pick the card it pays off: it lowers that card\'s outstanding and is not counted as spending (the card purchases are)' },
  { kind: 'emi', re: /\b(emi|loan ?(recovery|repay\w*|instal\w*)|nach.{0,25}\b(loan|finance|fin)\b|bajaj ?fin|home ?loan)\b/i,
    label: 'Looks like a loan EMI - EMIs are posted automatically from Loans, not entered as expenses' },
  { kind: 'investment', re: /\b(zerodha|groww|upstox|angel ?(one|broking)|kite|5 ?paisa|dhan|paytm ?money|kuvera|et ?money|smallcase|indmoney|scripbox|icici ?direct|hdfc ?sec\w*|kotak ?sec\w*|motilal|sharekhan|nse ?clearing|nsccl|indian ?clearing|iccl|bse ?ltd|mutual ?fund|\bmf\b|nach.{0,25}\bmut|bd .{0,12}mf|cams|kfin\w*|sip|nps|apy|atal ?pension|ppf|sukanya)\b/i,
    label: 'Looks like an investment (broker, mutual fund, SIP, NPS/APY/PPF) - record it under Invest → Add / withdraw, not as an expense' },
]

const near = (a, b) => Math.abs(Number(a) - Number(b)) <= AMOUNT_TOL
const within = (a, b, days = WINDOW_DAYS) => Math.abs(daysBetween(a, b)) <= days

/**
 * Greedy one-to-one matching: each recorded item can absorb at most one statement row, and each
 * row takes the closest-dated candidate. (Two ₹4,000 SIPs on the same day must match two ₹4,000
 * debits, not both claim the first one.)
 */
function claim(candidates, used, row, days) {
  let best = null, bestGap = Infinity
  for (const c of candidates) {
    if (used.has(c.key) || !near(c.amount, row.amount) || !within(c.date, row.date, days)) continue
    const gap = Math.abs(daysBetween(c.date, row.date))
    if (gap < bestGap) { best = c; bestGap = gap }
  }
  if (best) used.add(best.key)
  return best
}

const shortDate = (iso) => new Date(iso + 'T00:00:00Z').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * @param rows parsed statement rows ({ date, description, amount, direction, ... })
 * @param data the app's tables (sip_master, sip_installments, emi_master, emi_payments,
 *             investment_txns, holdings, expenses)
 * @param opts.people household member names - a payment to/from one of them is an internal transfer
 * @param opts.aliases other spellings of those names as banks print them ("suj kothav", "Anil Alai")
 */
export function reconcile(rows, data, { people = [], aliases = [] } = {}) {
  const sipById = new Map((data.sip_master || []).map((s) => [s.id, s]))
  const emiById = new Map((data.emi_master || []).map((e) => [e.id, e]))
  const holdingById = new Map((data.holdings || []).map((h) => [h.id, h]))

  const sipCands = (data.sip_installments || [])
    .filter((i) => i.status !== 'skipped' && sipById.get(i.sip_id)?.funded_by !== 'employer') // employer-credited NPS/EPF never hits a bank statement
    .map((i) => ({ key: `sip:${i.sip_id}|${i.due_date}`, date: i.due_date, amount: i.amount, name: sipById.get(i.sip_id)?.fund_name || 'SIP' }))
  const emiCands = (data.emi_payments || [])
    .filter((p) => p.status !== 'skipped' && emiById.get(p.emi_id)?.emi_kind !== 'card_emi') // a card EMI is billed on the card, not debited from the bank
    .map((p) => ({ key: `emi:${p.emi_id}|${p.due_date}`, date: p.due_date, amount: p.amount, name: emiById.get(p.emi_id)?.name || 'EMI' }))
  const invCands = (data.investment_txns || [])
    .filter((t) => t.kind === 'additional')
    .map((t) => ({ key: `inv:${t.id}`, date: t.date, amount: t.amount, name: holdingById.get(t.holding_id)?.name || 'an investment' }))
  const expCands = (data.expenses || [])
    .filter((e) => !/·\s*ref:/.test(e.note || '')) // ref-tagged imports are already caught exactly by the ref check
    .map((e) => ({ key: `exp:${e.id}`, date: e.date, amount: e.amount, name: e.note || e.category || 'an expense' }))

  // Letter-boundaries, not \b: bank narrations glue names onto digits ("SentIMPS6244...Lalit Alai").
  // A member's own name must be the whole word ("Lalit", not "Lalitha"); an alias is a prefix, because
  // aliases are usually the bank's truncation ("suj kothav" also matches "suj.kothavade@").
  // Words in a multi-word alias may be joined by a space, dot, slash or underscore.
  const clean = (list) => list.map((p) => String(p || '').trim()).filter((p) => p && p !== 'Joint' && p.length >= 3)
  const pattern = (n) => n.split(/[\s./_-]+/).map(escapeRe).join('[\\s./_-]*')
  const own = clean(people).map(pattern), alias = clean(aliases).map(pattern)
  const parts = [own.length && `(?:${own.join('|')})(?![a-z])`, alias.length && `(?:${alias.join('|')})`].filter(Boolean)
  const personRe = parts.length ? new RegExp(`(?<![a-z])(?:${parts.join('|')})`, 'i') : null
  const used = new Set()

  return rows.map((row) => {
    if (row.direction !== 'debit') return row
    let hit
    if ((hit = claim(sipCands, used, row))) return { ...row, match: { kind: 'sip', recorded: true, label: `Already tracked as your SIP instalment - ${hit.name} (${shortDate(hit.date)})` } }
    if ((hit = claim(emiCands, used, row))) return { ...row, match: { kind: 'emi', recorded: true, label: `Already tracked as your EMI - ${hit.name} (${shortDate(hit.date)})` } }
    if ((hit = claim(invCands, used, row))) return { ...row, match: { kind: 'investment', recorded: true, label: `Already recorded as an additional investment in ${hit.name} (${shortDate(hit.date)})` } }
    if ((hit = claim(expCands, used, row, 0))) return { ...row, match: { kind: 'expense', recorded: true, label: `Same amount on the same day as an expense you already entered ("${String(hit.name).slice(0, 40)}")` } }

    const text = row.description || ''
    for (const k of KEYWORDS) if (k.re.test(text)) return { ...row, match: { kind: k.kind, recorded: false, label: k.label } }
    if (personRe && personRe.test(text)) return { ...row, match: { kind: 'transfer', recorded: false, label: 'Transfer to someone in your household (or your own other account) - money moving between you is not spending' } }
    return row
  })
}

export const MATCH_BADGE = {
  sip: 'SIP', emi: 'EMI', investment: 'investment', expense: 'already entered', card_payment: 'card bill', transfer: 'own transfer',
}
