// Where the Supabase project details come from: build-time env (deployed app) or, for a quick
// local trial, the values the user pastes on the first screen (kept in this browser only).
const LS = 'ledger_sb_config'
const MODE = 'ledger_mode'

export function getConfig() {
  const url = import.meta.env.VITE_SUPABASE_URL
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY
  if (url && key) return { url, key, source: 'env' }
  try {
    const c = JSON.parse(localStorage.getItem(LS) || 'null')
    if (c?.url && c?.key) return { ...c, source: 'browser' }
  } catch { /* ignore */ }
  return null
}
export const saveConfig = (url, key) => { try { localStorage.setItem(LS, JSON.stringify({ url: url.trim().replace(/\/$/, ''), key: key.trim() })) } catch { /* ignore */ } }
export const clearConfig = () => { try { localStorage.removeItem(LS) } catch { /* ignore */ } }
export const getMode = () => { try { return localStorage.getItem(MODE) } catch { return null } }
export const setMode = (m) => { try { m ? localStorage.setItem(MODE, m) : localStorage.removeItem(MODE) } catch { /* ignore */ } }
