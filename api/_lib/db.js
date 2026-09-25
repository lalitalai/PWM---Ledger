// Supabase implementation of the `db` interface used by job.js. Uses the SERVICE-ROLE key, which bypasses
// row-level security - so it only ever runs on the server (Vercel function), never in the browser,
// and every query is explicitly scoped to one household.
import { createClient } from '@supabase/supabase-js'
import { TABLES } from '../../src/data/tables.js'

const PAGE = 1000
const fail = (error, what) => { if (error) throw new Error(`${what}: ${error.message}`) }

export function createDb(url, serviceKey) {
  const sb = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })

  async function fetchAll(table, hh) {
    const rows = []
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await sb.from(table).select('*').eq('household_id', hh).order('id').range(from, from + PAGE - 1)
      fail(error, `Loading ${table}`)
      rows.push(...data)
      if (data.length < PAGE) break
    }
    return rows
  }

  return {
    sb,
    async householdIds() {
      const { data, error } = await sb.from('households').select('id')
      fail(error, 'Listing households')
      return data.map((h) => h.id)
    },
    /** Verify a user's access token and return their household id (null if invalid / not in a household). */
    async householdForToken(token) {
      const { data: { user }, error } = await sb.auth.getUser(token)
      if (error || !user) return null
      const { data, error: e2 } = await sb.from('household_members').select('household_id').eq('user_id', user.id).maybeSingle()
      fail(e2, 'Looking up household')
      return data?.household_id || null
    },
    async loadAll(hh) {
      const out = {}
      await Promise.all(TABLES.map(async (t) => { out[t] = await fetchAll(t, hh) }))
      return out
    },
    async insertIgnore(table, rows, onConflict) {
      const { data, error } = await sb.from(table).upsert(rows, { onConflict, ignoreDuplicates: true }).select()
      fail(error, `Saving to ${table}`)
      return data || []
    },
    async update(table, id, patch) {
      const { error } = await sb.from(table).update(patch).eq('id', id)
      fail(error, `Updating ${table}`)
    },
    async upsert(table, row, onConflict) {
      const { error } = await sb.from(table).upsert(row, { onConflict })
      fail(error, `Saving to ${table}`)
    },
    async log(hh, task, ok, message) {
      const { error } = await sb.from('job_log').insert({ household_id: hh, task, ok, message })
      fail(error, 'Writing job log')
    },
    async lastLog(hh, task) {
      const { data } = await sb.from('job_log').select('ran_at').eq('household_id', hh).eq('task', task).order('ran_at', { ascending: false }).limit(1)
      return data?.[0]?.ran_at || null
    },
    async pruneLog(hh, beforeISO) {
      await sb.from('job_log').delete().eq('household_id', hh).lt('ran_at', beforeISO)
    },
  }
}
