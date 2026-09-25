import { useState } from 'react'
import { NavLink, Outlet, useLocation, Link } from 'react-router-dom'
import { Home, Receipt, TrendingUp, Target, Landmark, Wallet, Building2, Settings as Cog, MoreHorizontal, RefreshCw, LogOut, Sun, Moon, X, Check, AlertTriangle, PiggyBank } from 'lucide-react'
import { useData } from '../ctx/DataContext.jsx'
import { cx } from './ui.jsx'

const MAIN = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/expenses', label: 'Spend', icon: Receipt },
  { to: '/invest', label: 'Invest', icon: TrendingUp },
  { to: '/goals', label: 'Goals', icon: Target },
  { to: '/loans', label: 'Loans', icon: Landmark },
]
const MORE = [
  { to: '/income', label: 'Income', icon: Wallet },
  { to: '/masters', label: 'Banks & cards', icon: Building2 },
  { to: '/settings', label: 'Settings', icon: Cog },
]

function applyTheme(t) {
  if (t === 'auto') document.documentElement.removeAttribute('data-theme')
  else document.documentElement.setAttribute('data-theme', t)
  try { t === 'auto' ? localStorage.removeItem('ledger_theme') : localStorage.setItem('ledger_theme', t) } catch { /* ignore */ }
}
export const currentTheme = () => { try { return localStorage.getItem('ledger_theme') || 'auto' } catch { return 'auto' } }

function ThemeButton() {
  const [t, setT] = useState(currentTheme())
  const dark = t === 'dark' || (t === 'auto' && window.matchMedia?.('(prefers-color-scheme: dark)').matches)
  return (
    <button className="rounded-md p-2 text-soft hover:bg-sunken" aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
      onClick={() => { const n = dark ? 'light' : 'dark'; setT(n); applyTheme(n) }}>
      {dark ? <Sun size={17} /> : <Moon size={17} />}
    </button>
  )
}

function Brand() {
  return (
    <Link to="/" className="flex items-center gap-2.5">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gold-fill text-white"><PiggyBank size={18} /></span>
      <span className="font-display text-[20px] font-semibold tracking-tight">The Ledger</span>
    </Link>
  )
}

function Toast() {
  const { toast, setToast } = useData()
  if (!toast) return null
  const err = toast.tone === 'error'
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[84px] z-[60] flex justify-center px-4 md:bottom-6" role="status" aria-live="polite">
      <div className={cx('pointer-events-auto flex max-w-md items-start gap-2.5 rounded-xl border px-4 py-3 text-[13.5px] shadow-lg',
        err ? 'border-rust/40 bg-rust-soft text-rust' : 'border-line-strong bg-surface text-ink')}>
        {err ? <AlertTriangle size={16} className="mt-0.5 shrink-0" /> : <Check size={16} className="mt-0.5 shrink-0 text-sage" />}
        <span>{toast.msg}</span>
        <button onClick={() => setToast(null)} aria-label="Dismiss" className="ml-1 text-muted"><X size={15} /></button>
      </div>
    </div>
  )
}

export default function Shell() {
  const { household, me, mode, refreshPrices, busy, exit, loading, error, reload } = useData()
  const [more, setMore] = useState(false)
  const loc = useLocation()
  const moreActive = MORE.some((m) => loc.pathname.startsWith(m.to))

  return (
    <div className="min-h-dvh md:flex">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-line bg-surface px-4 py-5 md:flex">
        <Brand />
        <nav className="mt-7 flex flex-1 flex-col gap-0.5" aria-label="Main">
          {[...MAIN, ...MORE].map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end}
              className={({ isActive }) => cx('flex items-center gap-3 rounded-lg px-3 py-2.5 text-[14px] font-medium transition', isActive ? 'bg-gold-soft text-ink' : 'text-soft hover:bg-sunken')}>
              <n.icon size={18} />{n.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-line pt-4">
          <div className="mb-2 px-1 text-[12px] text-soft">
            <div className="font-medium text-ink">{household?.name}</div>
            <div>{mode === 'demo' ? 'Demo data - stored on this device only' : `Signed in as ${me}`}</div>
          </div>
          <button onClick={refreshPrices} disabled={busy} className="flex w-full items-center gap-2 whitespace-nowrap rounded-md px-2 py-2 text-[13px] text-soft hover:bg-sunken"><RefreshCw size={15} className={busy ? 'animate-spin' : ''} />Refresh prices</button>
          <div className="mt-1 flex items-center justify-between">
            <ThemeButton />
            <button onClick={exit} className="flex items-center gap-2 rounded-md px-2 py-2 text-[13px] text-soft hover:bg-sunken" aria-label={mode === 'demo' ? 'Leave demo' : 'Sign out'}><LogOut size={16} />{mode === 'demo' ? 'Leave demo' : 'Sign out'}</button>
          </div>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        {/* Mobile top bar */}
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-bg/95 px-4 py-2.5 backdrop-blur md:hidden">
          <Brand />
          <div className="flex items-center">
            <button onClick={refreshPrices} disabled={busy} className="rounded-md p-2 text-soft" aria-label="Refresh prices"><RefreshCw size={17} className={busy ? 'animate-spin' : ''} /></button>
            <ThemeButton />
          </div>
        </header>

        {mode === 'demo' && (
          <div className="border-b border-gold-fill/30 bg-gold-soft px-4 py-2 text-center text-[12.5px] text-ink">
            You are looking at <b>sample data</b> stored only in this browser. <button onClick={exit} className="font-semibold underline">Leave the demo</button> to connect your own database.
          </div>
        )}

        <main className="mx-auto w-full max-w-6xl px-4 pb-28 pt-5 md:px-8 md:pb-12 md:pt-8">
          {error && (
            <div className="mb-4 rounded-lg border border-rust/40 bg-rust-soft px-4 py-3 text-[13.5px] text-rust">
              Could not load your data: {error} <button className="ml-2 font-semibold underline" onClick={() => reload()}>Try again</button>
            </div>
          )}
          {loading ? <div className="py-24 text-center text-soft">Loading your ledger…</div> : <Outlet />}
        </main>
      </div>

      {/* Mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden" aria-label="Main">
        <div className="grid grid-cols-6">
          {MAIN.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} onClick={() => setMore(false)}
              className={({ isActive }) => cx('flex flex-col items-center gap-0.5 py-2 text-[10.5px] font-medium', isActive ? 'text-gold' : 'text-muted')}>
              <n.icon size={20} />{n.label}
            </NavLink>
          ))}
          <button onClick={() => setMore((v) => !v)} className={cx('flex flex-col items-center gap-0.5 py-2 text-[10.5px] font-medium', more || moreActive ? 'text-gold' : 'text-muted')} aria-expanded={more}>
            <MoreHorizontal size={20} />More
          </button>
        </div>
      </nav>
      {more && (
        <div className="fixed inset-0 z-40 md:hidden" onClick={() => setMore(false)}>
          <div className="absolute inset-x-3 bottom-[76px] rounded-2xl border border-line bg-surface p-2 shadow-xl" onClick={(e) => e.stopPropagation()}>
            {MORE.map((n) => (
              <NavLink key={n.to} to={n.to} onClick={() => setMore(false)} className="flex items-center gap-3 rounded-lg px-3 py-3 text-[14.5px] font-medium text-ink hover:bg-sunken"><n.icon size={19} className="text-soft" />{n.label}</NavLink>
            ))}
            <button onClick={exit} className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-[14.5px] font-medium text-soft hover:bg-sunken"><LogOut size={19} />{mode === 'demo' ? 'Leave demo' : 'Sign out'}</button>
          </div>
        </div>
      )}
      <Toast />
    </div>
  )
}
