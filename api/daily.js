// Vercel serverless function: POST /api/daily (the "Refresh prices" button) and GET /api/daily (the daily cron).
//
//   cron  : Vercel sends  Authorization: Bearer <CRON_SECRET>  -> runs every household
//   user  : the app sends Authorization: Bearer <user's Supabase access token> -> runs only that user's household
//
// Environment variables (Vercel -> Settings -> Environment Variables):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CRON_SECRET, and optionally GOLDAPI_KEY
import { timingSafeEqual } from 'node:crypto'
import { createDb } from './_lib/db.js'
import { runHousehold, istToday } from './_lib/job.js'

const COOLDOWN_MS = 60 * 1000 // a person hammering "Refresh" should not hammer the free price APIs

const safeEqual = (a, b) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y) }
const send = (res, code, body) => { res.statusCode = code; res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store'); res.end(JSON.stringify(body)) }

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') return send(res, 405, { ok: false, error: 'Use GET or POST' })
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return send(res, 500, { ok: false, error: 'Server is missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY. Add them in Vercel -> Settings -> Environment Variables and redeploy.' })

  const auth = req.headers.authorization || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
  if (!token) return send(res, 401, { ok: false, error: 'Not signed in' })

  try {
    const db = createDb(url, key)
    let ids
    let byUser = false
    if (process.env.CRON_SECRET && safeEqual(token, process.env.CRON_SECRET)) ids = await db.householdIds()
    else {
      const hh = await db.householdForToken(token)
      if (!hh) return send(res, 401, { ok: false, error: 'Not signed in' })
      ids = [hh]; byUser = true
    }

    const shared = {}
    const results = []
    for (const hh of ids) {
      if (byUser) {
        const last = await db.lastLog(hh, 'daily')
        if (last && Date.now() - Date.parse(last) < COOLDOWN_MS) { results.push({ ok: true, summary: 'Refreshed a moment ago - nothing more to do yet.', steps: [] }); continue }
      }
      const r = await runHousehold(db, hh, shared, { today: istToday(), goldKey: process.env.GOLDAPI_KEY })
      await db.log(hh, 'daily', r.ok, `${byUser ? 'manual' : 'scheduled'} run: ${r.summary}`.slice(0, 500)).catch(() => {})
      results.push(r)
    }
    const ok = results.every((r) => r.ok)
    return send(res, 200, { ok, summary: results[0]?.summary || 'No households yet', households: results.length })
  } catch (e) {
    return send(res, 500, { ok: false, error: e?.message || 'Unexpected error' })
  }
}
