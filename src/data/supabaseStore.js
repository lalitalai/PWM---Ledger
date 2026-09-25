import { createClient } from '@supabase/supabase-js'
import { TABLES, emptyData } from './tables.js'

const PAGE = 1000 // Supabase returns at most 1000 rows per request, so page through

export function createSupabase(url, key) {
  return createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
}

const fail = (error, what) => { if (error) throw new Error(`${what}: ${error.message}`) }

export function supabaseStore(sb) {
  async function fetchAll(table) {
    const rows = []
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await sb.from(table).select('*').order('id').range(from, from + PAGE - 1)
      fail(error, `Loading ${table}`)
      rows.push(...data)
      if (data.length < PAGE) break
    }
    return rows
  }
  return {
    mode: 'supabase',
    sb,
    /** The signed-in user's household + which member they are. null when they have not joined one yet. */
    async loadContext() {
      const { data: { user } } = await sb.auth.getUser()
      if (!user) return null
      const { data: members, error } = await sb.from('household_members').select('*')
      fail(error, 'Loading membership')
      const me = (members || []).find((m) => m.user_id === user.id)
      if (!me) return { user, household: null, me: null, members: [] }
      const { data: household, error: e2 } = await sb.from('households').select('*').eq('id', me.household_id).single()
      fail(e2, 'Loading household')
      return { user, household, me, members }
    },
    async loadAll() {
      const out = emptyData()
      await Promise.all(TABLES.map(async (t) => { out[t] = await fetchAll(t) }))
      return out
    },
    async insert(table, rows) {
      const list = Array.isArray(rows) ? rows : [rows]
      if (!list.length) return []
      const { data, error } = await sb.from(table).insert(list).select()
      fail(error, `Saving to ${table}`)
      return data
    },
    /** Insert, silently skipping rows that already exist (unique key = onConflict). Used by the automation. */
    async insertIgnore(table, rows, onConflict) {
      if (!rows.length) return []
      const { data, error } = await sb.from(table).upsert(rows, { onConflict, ignoreDuplicates: true }).select()
      fail(error, `Saving to ${table}`)
      return data || []
    },
    async update(table, id, patch) {
      const { data, error } = await sb.from(table).update(patch).eq('id', id).select().single()
      fail(error, `Updating ${table}`)
      return data
    },
    async remove(table, id) {
      const { error } = await sb.from(table).delete().eq('id', id)
      fail(error, `Deleting from ${table}`)
    },
    async updateHousehold(id, patch) {
      const { data, error } = await sb.from('households').update(patch).eq('id', id).select().single()
      fail(error, 'Updating household')
      return data
    },
    async createHousehold(name, members, me) {
      const { data, error } = await sb.rpc('create_household', { p_name: name, p_members: members, p_me: me })
      fail(error, 'Creating household'); return data
    },
    async joinHousehold(code, me) {
      const { data, error } = await sb.rpc('join_household', { p_code: code, p_me: me })
      fail(error, 'Joining household'); return data
    },
    async signOut() { await sb.auth.signOut() },
  }
}
