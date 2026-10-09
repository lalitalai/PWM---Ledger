import { describe, it, expect } from 'vitest'
import { reconcile } from '../src/lib/statement/reconcile.js'
import { emptyData } from '../src/data/tables.js'

const debit = (date, amount, description = 'Some payee') => ({ date, amount, description, direction: 'debit' })
const people = ['Lalit', 'Sujata']

const data = () => ({
  ...emptyData(),
  sip_master: [
    { id: 's1', fund_name: 'Kotak Flexicap Fund', amount: 4000, sip_day: 1 },
    { id: 's2', fund_name: 'Groww Nifty Index', amount: 4000, sip_day: 1 },
    { id: 'nps', fund_name: 'NPS employer', amount: 6000, sip_day: 1, funded_by: 'employer' },
  ],
  sip_installments: [
    { sip_id: 's1', due_date: '2026-09-01', amount: 4000, status: 'paid' },
    { sip_id: 's2', due_date: '2026-09-01', amount: 4000, status: 'paid' },
    { sip_id: 's1', due_date: '2026-08-01', amount: 4000, status: 'skipped' },
    { sip_id: 'nps', due_date: '2026-09-01', amount: 6000, status: 'paid' },
  ],
  emi_master: [{ id: 'l1', name: 'Union Bank home loan', emi_amount: 16183 }, { id: 'c1', name: 'iPhone EMI', emi_kind: 'card_emi' }],
  emi_payments: [{ emi_id: 'l1', due_date: '2026-09-01', amount: 16183, status: 'paid' }, { emi_id: 'c1', due_date: '2026-09-02', amount: 13317, status: 'paid' }],
  holdings: [{ id: 'h1', name: 'Zerodha equity' }],
  investment_txns: [{ id: 't1', date: '2026-09-01', holding_id: 'h1', kind: 'additional', amount: 3000 }],
  expenses: [{ id: 'e1', date: '2026-09-04', amount: 250, note: 'Lunch', category: 'Dining' }],
})

describe('reconcile against what the app already tracks', () => {
  it('matches a NACH SIP debit to the auto-posted SIP instalment, even a few days late', () => {
    const [r] = reconcile([debit('2026-09-03', 4000, 'NACH-MUT-DR-BD KOTAK MF')], data(), { people })
    expect(r.match).toMatchObject({ kind: 'sip', recorded: true })
    expect(r.match.label).toMatch(/Kotak Flexicap|Groww Nifty/)
  })

  it('two equal SIPs on the same day claim two separate debits, and a third debit is not "already tracked"', () => {
    const out = reconcile([debit('2026-09-01', 4000, 'NACH A'), debit('2026-09-01', 4000, 'NACH B'), debit('2026-09-01', 4000, 'random shop')], data(), { people })
    expect(out.filter((r) => r.match?.recorded)).toHaveLength(2)
    expect(out[2].match).toBeUndefined()
  })

  it('ignores skipped instalments and employer-credited SIPs (they never hit the bank)', () => {
    const out = reconcile([debit('2026-08-01', 4000, 'random'), debit('2026-09-01', 6000, 'random')], data(), { people })
    expect(out.every((r) => !r.match)).toBe(true)
  })

  it('matches an EMI debit to the posted EMI, but not a credit-card EMI', () => {
    const out = reconcile([debit('2026-09-01', 16183, 'NACH-RPN-DR-UNION BANK OF INDIA'), debit('2026-09-02', 13317, 'shop')], data(), { people })
    expect(out[0].match).toMatchObject({ kind: 'emi', recorded: true })
    expect(out[1].match).toBeUndefined()
  })

  it('matches a broker transfer to an additional investment already entered under Invest', () => {
    const [r] = reconcile([debit('2026-09-01', 3000, 'UPI/ZERODHA BR/zerodhabroking')], data(), { people })
    expect(r.match).toMatchObject({ kind: 'investment', recorded: true })
    expect(r.match.label).toMatch(/Zerodha equity/)
  })

  it('flags a broker / MF / pension debit as not-an-expense even when nothing records it yet', () => {
    const out = reconcile([
      debit('2026-09-20', 9999, 'ACH/Groww/ICIC7020506220002571'),
      debit('2026-09-20', 5000, 'ACH/FIN NSE Clearing Lim'),
      debit('2026-09-20', 346, 'SI: APY CONTN- APY-A9585317'),
    ], data(), { people })
    for (const r of out) expect(r.match).toMatchObject({ kind: 'investment', recorded: false })
  })

  it('flags card bill payments, loan EMIs and household transfers by description', () => {
    const out = reconcile([
      debit('2026-09-20', 285.25, 'UPI/CRED Club/UTIB/661008359056/payment'),
      debit('2026-09-20', 318, 'eTXN/To:606706520000172/emi'),
      debit('2026-09-20', 30000, 'sujata kothavade'),
      debit('2026-09-20', 43000, 'SentIMPS624421519698Lalit Alai/IDFBX5135/IMPS'),
    ], data(), { people })
    expect(out.map((r) => r.match.kind)).toEqual(['card_payment', 'emi', 'transfer', 'transfer'])
  })

  it('catches a hand-entered expense with the same amount on the same day only', () => {
    const out = reconcile([debit('2026-09-04', 250, 'Cafe'), debit('2026-09-05', 250, 'Cafe')], data(), { people })
    expect(out[0].match).toMatchObject({ kind: 'expense', recorded: true })
    expect(out[1].match).toBeUndefined()
  })

  it('leaves ordinary spending and every credit untouched', () => {
    const out = reconcile([debit('2026-09-10', 200, 'Hariom sweets'), { date: '2026-09-01', amount: 4000, description: 'NACH MF', direction: 'credit' }], data(), { people })
    expect(out[0].match).toBeUndefined(); expect(out[1].match).toBeUndefined()
  })

  it('recognises shortened name spellings added as aliases, and a bare "CRED" payee', () => {
    const rows = [debit('2026-09-20', 30000, 'UPI/suj kothav/suj.kothavade@/UPI/ICICI Bank'), debit('2026-09-21', 16244.32, 'CRED'), debit('2026-09-22', 120, 'Credit Society canteen')]
    const without = reconcile(rows, data(), { people })
    expect(without[0].match).toBeUndefined()
    const out = reconcile(rows, data(), { people, aliases: ['suj kothav'] })
    expect(out[0].match.kind).toBe('transfer')
    expect(out[1].match.kind).toBe('card_payment')
    expect(out[2].match).toBeUndefined() // "Credit" is not "CRED"
  })
})
