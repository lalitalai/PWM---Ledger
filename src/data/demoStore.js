// A complete in-browser stand-in for the database so the app can be tried without any setup.
// Data lives in localStorage on this device only.
import { TABLES, emptyData } from './tables.js'
import { seedDemo } from './seed.js'

const KEY = 'ledger_demo_v2'
const uid = () => (globalThis.crypto?.randomUUID ? crypto.randomUUID() : 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36))

export function demoStore({ today, reset = false, persist = true } = {}) {
  let state = null
  if (!reset && persist) {
    try { state = JSON.parse(localStorage.getItem(KEY) || 'null') } catch { state = null }
  }
  if (!state) state = seedDemo(today)
  const save = () => { if (persist) try { localStorage.setItem(KEY, JSON.stringify(state)) } catch { /* storage full or blocked */ } }
  save()

  const uniqueKey = { sip_installments: ['sip_id', 'due_date'], emi_payments: ['emi_id', 'due_date'], portfolio_snapshots: ['household_id', 'date'] }
  const HH = 'demo-household'
  const stamp = (table, r) => ({ id: uid(), household_id: HH, created_at: new Date().toISOString(), ...r })

  return {
    mode: 'demo',
    async loadContext() {
      return { user: { id: 'demo-user', email: 'demo@local' }, household: state.household, me: { member_name: state.me, household_id: HH }, members: [] }
    },
    async loadAll() {
      const out = emptyData()
      for (const t of TABLES) out[t] = structuredClone(state.tables[t] || [])
      return out
    },
    async insert(table, rows) {
      const list = (Array.isArray(rows) ? rows : [rows]).map((r) => stamp(table, r))
      state.tables[table] = [...(state.tables[table] || []), ...list]
      save()
      return structuredClone(list)
    },
    async insertIgnore(table, rows, onConflict) {
      const cols = onConflict ? onConflict.split(',').map((s) => s.trim()) : uniqueKey[table]
      const fresh = []
      for (const r of rows) {
        const dup = (state.tables[table] || []).some((x) => cols.every((c) => x[c] === r[c])) || fresh.some((x) => cols.every((c) => x[c] === r[c]))
        if (!dup) fresh.push(stamp(table, r))
      }
      state.tables[table] = [...(state.tables[table] || []), ...fresh]
      save()
      return structuredClone(fresh)
    },
    async update(table, id, patch) {
      const i = state.tables[table].findIndex((r) => r.id === id)
      if (i < 0) throw new Error('Row not found')
      state.tables[table][i] = { ...state.tables[table][i], ...patch }
      save()
      return structuredClone(state.tables[table][i])
    },
    async remove(table, id) {
      state.tables[table] = state.tables[table].filter((r) => r.id !== id)
      // mimic ON DELETE CASCADE for the relations the app relies on
      const cascade = { sip_master: [['sip_installments', 'sip_id']], emi_master: [['emi_payments', 'emi_id'], ['emi_prepayments', 'emi_id']], holdings: [['investment_txns', 'holding_id']] }
      for (const [child, col] of cascade[table] || []) state.tables[child] = state.tables[child].filter((r) => r[col] !== id)
      // mimic ON DELETE SET NULL
      const nullify = { bank_accounts: ['income', 'expenses', 'sip_master', 'emi_master'].map((t) => [t, 'bank_account_id']), credit_cards: [['expenses', 'credit_card_id']], goals: [['holdings', 'goal_id'], ['sip_master', 'goal_id']], holdings: [['sip_master', 'holding_id']] }
      for (const [child, col] of nullify[table] || []) state.tables[child] = state.tables[child].map((r) => (r[col] === id ? { ...r, [col]: null } : r))
      save()
    },
    async updateHousehold(_id, patch) { state.household = { ...state.household, ...patch }; save(); return structuredClone(state.household) },
    async signOut() {},
    reset() { try { localStorage.removeItem(KEY) } catch { /* ignore */ } },
  }
}
export const clearDemo = () => { try { localStorage.removeItem(KEY) } catch { /* ignore */ } }
