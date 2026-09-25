import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { emptyData } from '../data/tables.js'
import { buildDerived } from '../lib/derived.js'
import { computeAutomation } from '../lib/automation.js'
import { mergeSettings } from '../lib/settings.js'
import { todayISO } from '../lib/dates.js'

const Ctx = createContext(null)
export const useData = () => useContext(Ctx)

// Deleting these parents removes/clears children in the database; mirror that locally so the screen stays right.
const CASCADE = {
  sip_master: [['sip_installments', 'sip_id']],
  emi_master: [['emi_payments', 'emi_id'], ['emi_prepayments', 'emi_id']],
  holdings: [['investment_txns', 'holding_id']],
}
const NULLIFY = {
  bank_accounts: ['income', 'expenses', 'sip_master', 'emi_master', 'investment_txns', 'emi_prepayments'].map((t) => [t, 'bank_account_id']),
  credit_cards: [['expenses', 'credit_card_id'], ['expenses', 'settles_card_id'], ['emi_master', 'credit_card_id']],
  goals: [['holdings', 'goal_id'], ['sip_master', 'goal_id']],
  holdings: [['sip_master', 'holding_id']],
}
// tables whose changes can create new automatic rows
const AUTOMATED = new Set(['sip_master', 'emi_master', 'emi_prepayments', 'holdings'])

export function DataProvider({ store, ctx, onExit, children }) {
  const [data, setData] = useState(emptyData())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [household, setHousehold] = useState(ctx.household)
  const [today, setToday] = useState(todayISO())
  const [toast, setToast] = useState(null)
  const [busy, setBusy] = useState(false)
  const dataRef = useRef(data)
  const commit = useCallback((fn) => { const next = typeof fn === 'function' ? fn(dataRef.current) : fn; dataRef.current = next; setData(next) }, [])

  const notify = useCallback((msg, tone = 'ok') => { setToast({ id: Date.now() + Math.random(), msg, tone }) }, [])
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), toast.tone === 'error' ? 7000 : 3800); return () => clearTimeout(t) }, [toast])

  /** Post whatever SIP installments / EMI payments have fallen due since the last time. */
  const runAuto = useCallback(async (opts) => {
    const now = todayISO()
    const cur = dataRef.current
    // the demo has no server job to fetch historic NAVs, so it estimates units from the current price
    const { sipRows, emiRows } = computeAutomation(cur, now, { navMaxDays: store.mode === 'demo' ? 1e6 : 5, ...opts })
    if (!sipRows.length && !emiRows.length) return { sip: 0, emi: 0 }
    const [sip, emi] = await Promise.all([
      sipRows.length ? store.insertIgnore('sip_installments', sipRows, 'sip_id,due_date') : [],
      emiRows.length ? store.insertIgnore('emi_payments', emiRows, 'emi_id,due_date') : [],
    ])
    commit((d) => ({ ...d, sip_installments: [...d.sip_installments, ...sip], emi_payments: [...d.emi_payments, ...emi] }))
    return { sip: sip.length, emi: emi.length }
  }, [store, commit])

  const doReload = useCallback(async (quiet) => {
    if (!quiet) setLoading(true)
    try {
      const d = await store.loadAll()
      commit(d)
      setToday(todayISO())
      const r = await runAuto()
      if (r.sip + r.emi > 0) notify(`Posted ${r.sip ? `${r.sip} SIP instalment${r.sip > 1 ? 's' : ''}` : ''}${r.sip && r.emi ? ' and ' : ''}${r.emi ? `${r.emi} EMI payment${r.emi > 1 ? 's' : ''}` : ''} automatically`)
      setError(null)
    } catch (e) { setError(e.message || String(e)) } finally { setLoading(false) }
  }, [store, commit, runAuto, notify])

  const inflight = useRef(null)
  const reload = useCallback(({ quiet = false } = {}) => {
    if (inflight.current) return inflight.current // never run two loads at once (they could overwrite each other)
    inflight.current = doReload(quiet).finally(() => { inflight.current = null })
    return inflight.current
  }, [doReload])
  useEffect(() => { reload() }, [reload])

  // A phone app stays open for days: catch up whenever it comes back to the foreground.
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState !== 'visible') return
      const t = todayISO()
      setToday((old) => (old === t ? old : t))
      runAuto().catch(() => {})
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [runAuto])

  const derived = useMemo(() => buildDerived(data, today), [data, today])
  const settings = useMemo(() => mergeSettings(household?.settings), [household])
  const owners = useMemo(() => [...(household?.members || []), 'Joint'], [household])
  const people = household?.members || []

  const guard = useCallback(async (fn, fail = 'Something went wrong') => {
    setBusy(true)
    try { return await fn() } catch (e) { notify(e.message || fail, 'error'); throw e } finally { setBusy(false) }
  }, [notify])

  const add = useCallback((table, row) => guard(async () => {
    const [saved] = await store.insert(table, row)
    commit((d) => ({ ...d, [table]: [...d[table], saved] }))
    if (AUTOMATED.has(table)) await runAuto()
    return saved
  }), [store, commit, guard, runAuto])

  const addMany = useCallback((table, rows) => guard(async () => {
    const saved = await store.insert(table, rows)
    commit((d) => ({ ...d, [table]: [...d[table], ...saved] }))
    if (AUTOMATED.has(table)) await runAuto()
    return saved
  }), [store, commit, guard, runAuto])

  const edit = useCallback((table, id, patch) => guard(async () => {
    const saved = await store.update(table, id, patch)
    commit((d) => ({ ...d, [table]: d[table].map((r) => (r.id === id ? { ...r, ...saved } : r)) }))
    if (AUTOMATED.has(table)) await runAuto()
    return saved
  }), [store, commit, guard, runAuto])

  const del = useCallback((table, id) => guard(async () => {
    await store.remove(table, id)
    commit((d) => {
      const next = { ...d, [table]: d[table].filter((r) => r.id !== id) }
      for (const [child, col] of CASCADE[table] || []) next[child] = next[child].filter((r) => r[col] !== id)
      for (const [child, col] of NULLIFY[table] || []) next[child] = next[child].map((r) => (r[col] === id ? { ...r, [col]: null } : r))
      return next
    })
  }), [store, commit, guard])

  /** "Delete" a missed SIP instalment / EMI payment: keep a 'skipped' tombstone so the automation never re-creates it. */
  const skipRow = useCallback((table, id) => edit(table, id, { status: 'skipped' }), [edit])
  /** Undo a skip: remove the tombstone; the automation posts it again straight away. */
  const restoreRow = useCallback((table, id) => guard(async () => {
    await store.remove(table, id)
    commit((d) => ({ ...d, [table]: d[table].filter((r) => r.id !== id) }))
    await runAuto()
  }), [store, commit, guard, runAuto])

  const saveSettings = useCallback((patch) => guard(async () => {
    const settings = { ...(household?.settings || {}), ...patch }
    const h = await store.updateHousehold(household.id, { settings })
    setHousehold((old) => ({ ...old, ...h, settings: h?.settings ?? settings }))
  }), [store, household, guard])

  const renameHousehold = useCallback((name) => guard(async () => {
    const h = await store.updateHousehold(household.id, { name })
    setHousehold((old) => ({ ...old, ...h }))
  }), [store, household, guard])

  /** Pull the latest NAVs / prices. Live in Supabase mode (server function); simulated in the demo. */
  const refreshPrices = useCallback(async () => {
    setBusy(true)
    try {
      if (store.mode === 'demo') {
        const cur = dataRef.current
        const t = todayISO()
        const wobble = () => 1 + (Math.random() - 0.45) * 0.01
        const rows = cur.holdings.filter((h) => Number(h.price) > 0)
        for (const h of rows) await store.update('holdings', h.id, { price: Math.round(Number(h.price) * wobble() * 10000) / 10000, price_date: t })
        await reload({ quiet: true })
        notify('Demo prices nudged. In the live app this pulls real NAVs and prices.')
        return
      }
      const { data: { session } } = await store.sb.auth.getSession()
      const res = await fetch('/api/daily', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` }, body: '{}' })
      const out = await res.json().catch(() => ({}))
      if (!res.ok || out.ok === false) throw new Error(out.error || `Refresh failed (${res.status})`)
      await reload({ quiet: true })
      notify(out.summary || 'Prices refreshed')
    } catch (e) { notify(e.message, 'error') } finally { setBusy(false) }
  }, [store, reload, notify])

  const value = {
    store, mode: store.mode, ctx, household, settings, me: ctx.me?.member_name, people, owners, today,
    data, derived, loading, error, busy, reload, add, addMany, edit, del, skipRow, restoreRow, saveSettings, renameHousehold, refreshPrices, notify, toast, setToast, exit: onExit,
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
