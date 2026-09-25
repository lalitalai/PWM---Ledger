import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { createSupabase, supabaseStore } from './data/supabaseStore.js'
import { demoStore, clearDemo } from './data/demoStore.js'
import { getConfig, saveConfig, clearConfig, getMode, setMode } from './config.js'
import { todayISO } from './lib/dates.js'
import { DataProvider } from './ctx/DataContext.jsx'
import Shell from './components/Shell.jsx'
import { Welcome, SignIn, Onboarding } from './pages/Auth.jsx'

const Home = lazy(() => import('./pages/Home.jsx'))
const Expenses = lazy(() => import('./pages/Expenses.jsx'))
const Income = lazy(() => import('./pages/Income.jsx'))
const Invest = lazy(() => import('./pages/Invest.jsx'))
const Goals = lazy(() => import('./pages/Goals.jsx'))
const Loans = lazy(() => import('./pages/Loans.jsx'))
const Masters = lazy(() => import('./pages/Masters.jsx'))
const Settings = lazy(() => import('./pages/Settings.jsx'))

const Splash = ({ text = 'Loading…' }) => <div className="flex min-h-dvh items-center justify-center text-soft">{text}</div>

function Workspace({ store, ctx, onExit }) {
  return (
    <DataProvider store={store} ctx={ctx} onExit={onExit}>
      <Suspense fallback={<Splash />}>
        <Routes>
          <Route element={<Shell />}>
            <Route index element={<Home />} />
            <Route path="expenses/*" element={<Expenses />} />
            <Route path="income" element={<Income />} />
            <Route path="invest/*" element={<Invest />} />
            <Route path="goals/*" element={<Goals />} />
            <Route path="loans/*" element={<Loans />} />
            <Route path="masters" element={<Masters />} />
            <Route path="settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </Suspense>
    </DataProvider>
  )
}

function DemoGate({ onExit }) {
  const store = useMemo(() => demoStore({ today: todayISO() }), [])
  const [ctx, setCtx] = useState(null)
  useEffect(() => { store.loadContext().then(setCtx) }, [store])
  if (!ctx) return <Splash />
  return <Workspace store={store} ctx={ctx} onExit={() => { clearDemo(); onExit() }} />
}

function SupabaseGate({ cfg, onDemo, onResetConfig }) {
  const sb = useMemo(() => createSupabase(cfg.url, cfg.key), [cfg])
  const store = useMemo(() => supabaseStore(sb), [sb])
  const [session, setSession] = useState(undefined) // undefined = still checking
  const [ctx, setCtx] = useState(undefined)
  const [fatal, setFatal] = useState(null)

  useEffect(() => {
    sb.auth.getSession().then(({ data }) => setSession(data.session ?? null)).catch((e) => setFatal(e.message))
    const { data: sub } = sb.auth.onAuthStateChange((_e, s) => setSession(s ?? null))
    return () => sub.subscription.unsubscribe()
  }, [sb])

  const loadCtx = async () => { try { setCtx(await store.loadContext()) } catch (e) { setFatal(e.message) } }
  useEffect(() => { if (session) { setCtx(undefined); loadCtx() } else setCtx(null) /* eslint-disable-next-line */ }, [session?.user?.id])

  if (fatal) return (
    <div className="mx-auto max-w-md px-4 py-16 text-center">
      <p className="text-rust">Could not reach the database: {fatal}</p>
      <p className="mt-2 text-[13px] text-soft">Check the project URL / key, and that you have run supabase/schema.sql.</p>
      {cfg.source === 'browser' && <button className="btn btn-secondary mt-4" onClick={onResetConfig}>Change connection</button>}
    </div>
  )
  if (session === undefined) return <Splash />
  if (!session) return <SignIn sb={sb} onDemo={onDemo} canReset={cfg.source === 'browser'} onReset={onResetConfig} />
  if (ctx === undefined) return <Splash text="Opening your ledger…" />
  if (!ctx?.household) return <Onboarding store={store} user={session.user} onDone={loadCtx} onSignOut={() => store.signOut()} />
  return <Workspace key={ctx.household.id} store={store} ctx={ctx} onExit={() => store.signOut()} />
}

export default function App() {
  const [mode, setModeState] = useState(getMode())
  const [cfg, setCfg] = useState(getConfig())
  const goDemo = () => { setMode('demo'); setModeState('demo') }
  const leaveDemo = () => { setMode(null); setModeState(null) }

  if (mode === 'demo') return <DemoGate onExit={leaveDemo} />
  if (!cfg) return <Welcome onDemo={goDemo} onConnect={(u, k) => { saveConfig(u, k); setCfg(getConfig()) }} />
  return <SupabaseGate cfg={cfg} onDemo={goDemo} onResetConfig={() => { clearConfig(); setCfg(null) }} />
}
