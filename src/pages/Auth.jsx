import { useState } from 'react'
import { PiggyBank, Database, Play, Mail, KeyRound, Users, ShieldCheck } from 'lucide-react'
import { Btn, Field, Input, Select, Segmented, cx } from '../components/ui.jsx'

function Frame({ children, wide }) {
  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className={cx('w-full', wide ? 'max-w-3xl' : 'max-w-md')}>
        <div className="mb-6 flex items-center justify-center gap-2.5">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gold-fill text-white"><PiggyBank size={22} /></span>
          <span className="font-display text-[28px] font-semibold tracking-tight">The Ledger</span>
        </div>
        {children}
      </div>
    </div>
  )
}
const Panel = ({ children, className }) => <div className={cx('rounded-2xl border border-line bg-surface p-5 md:p-6', className)}>{children}</div>

/** First screen when no database is configured yet. */
export function Welcome({ onDemo, onConnect }) {
  const [url, setUrl] = useState('')
  const [key, setKey] = useState('')
  const [open, setOpen] = useState(false)
  const bad = url && !/^https:\/\/[a-z0-9-]+\.supabase\.(co|in)\/?$/i.test(url.trim())
  return (
    <Frame wide>
      <p className="mx-auto mb-6 max-w-xl text-center text-[15px] text-soft">
        One place for the household&apos;s spending, salary, SIPs, EMIs, goals and portfolio - private to the two of you, on any device.
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        <Panel>
          <Play size={20} className="text-gold" />
          <h2 className="mt-2 font-display text-[19px] font-semibold">Try it with sample data</h2>
          <p className="mt-1 text-[13.5px] text-soft">Explore every screen with an invented household. Nothing leaves this browser.</p>
          <Btn variant="primary" className="mt-4 w-full" onClick={onDemo}>Open the demo</Btn>
        </Panel>
        <Panel>
          <Database size={20} className="text-gold" />
          <h2 className="mt-2 font-display text-[19px] font-semibold">Connect your own database</h2>
          <p className="mt-1 text-[13.5px] text-soft">Paste the project URL and anon key from Supabase (Project Settings → API). Follow DEPLOY.md if you have not created one yet.</p>
          {!open ? <Btn className="mt-4 w-full" onClick={() => setOpen(true)}>Enter connection details</Btn> : (
            <form className="mt-4 space-y-3" onSubmit={(e) => { e.preventDefault(); if (!bad && url && key) onConnect(url, key) }}>
              <Field label="Project URL" error={bad ? 'Should look like https://abcd1234.supabase.co' : null}><Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://abcd1234.supabase.co" autoComplete="off" /></Field>
              <Field label="Anon (public) key"><Input value={key} onChange={(e) => setKey(e.target.value)} placeholder="eyJhbGciOi…" autoComplete="off" /></Field>
              <Btn variant="primary" type="submit" className="w-full" disabled={!url || !key || bad}>Connect</Btn>
            </form>
          )}
        </Panel>
      </div>
      <p className="mx-auto mt-5 max-w-xl text-center text-[12px] text-muted"><ShieldCheck size={14} className="mr-1.5 inline" />Your data lives in your own Supabase project, protected by per-household row-level security. Never use the service-role key in the browser.</p>
    </Frame>
  )
}

export function SignIn({ sb, onDemo, onReset, canReset }) {
  const [mode, setMode] = useState('in')
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setMsg(null)
    try {
      if (mode === 'in') {
        const { error } = await sb.auth.signInWithPassword({ email, password: pw })
        if (error) throw error
      } else if (mode === 'up') {
        const { data, error } = await sb.auth.signUp({ email, password: pw })
        if (error) throw error
        if (!data.session) setMsg({ tone: 'ok', text: 'Check your inbox and confirm your e-mail, then sign in. (You can switch off e-mail confirmation in Supabase → Authentication → Providers → Email if you prefer.)' })
      } else {
        const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin })
        if (error) throw error
        setMsg({ tone: 'ok', text: 'If that address has an account, a reset link is on its way.' })
      }
    } catch (err) { setMsg({ tone: 'error', text: err.message }) } finally { setBusy(false) }
  }
  return (
    <Frame>
      <Panel>
        <Segmented className="mb-4 w-full [&>button]:flex-1" value={mode === 'reset' ? 'in' : mode} onChange={setMode} options={[{ value: 'in', label: 'Sign in' }, { value: 'up', label: 'Create account' }]} />
        <form className="space-y-3" onSubmit={submit}>
          <Field label="E-mail"><Input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          {mode !== 'reset' && <Field label="Password" hint={mode === 'up' ? 'At least 8 characters' : null}><Input type="password" required minLength={mode === 'up' ? 8 : undefined} autoComplete={mode === 'up' ? 'new-password' : 'current-password'} value={pw} onChange={(e) => setPw(e.target.value)} /></Field>}
          {msg && <div className={cx('rounded-lg px-3 py-2 text-[13px]', msg.tone === 'error' ? 'bg-rust-soft text-rust' : 'bg-sage-soft text-sage')}>{msg.text}</div>}
          <Btn variant="primary" type="submit" className="w-full" disabled={busy}>{mode === 'in' ? 'Sign in' : mode === 'up' ? 'Create account' : 'Send reset link'}</Btn>
        </form>
        <div className="mt-4 flex items-center justify-between text-[12.5px] text-soft">
          {mode === 'reset' ? <button className="underline" onClick={() => setMode('in')}>Back to sign in</button> : <button className="underline" onClick={() => setMode('reset')}>Forgot password?</button>}
          <button className="underline" onClick={onDemo}>Explore with sample data</button>
        </div>
      </Panel>
      {canReset && <p className="mt-4 text-center text-[12px] text-muted"><button className="underline" onClick={onReset}>Use a different database</button></p>}
    </Frame>
  )
}

/** Signed in but not yet in a household: create it (first person) or join with the invite code (second person). */
export function Onboarding({ store, user, onDone, onSignOut }) {
  const [tab, setTab] = useState('create')
  const [name, setName] = useState('Our Household')
  const [a, setA] = useState('Lalit')
  const [b, setB] = useState('Sujata')
  const [me, setMe] = useState('a')
  const [code, setCode] = useState('')
  const [joinMe, setJoinMe] = useState('')
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(false)

  const run = async (fn) => { setBusy(true); setErr(null); try { await fn(); await onDone() } catch (e) { setErr(e.message) } finally { setBusy(false) } }
  const create = (e) => { e.preventDefault(); const members = [a.trim(), b.trim()].filter(Boolean); const who = me === 'a' ? a.trim() : b.trim(); run(() => store.createHousehold(name, members, who)) }
  const join = (e) => { e.preventDefault(); run(() => store.joinHousehold(code, joinMe.trim())) }

  return (
    <Frame>
      <Panel>
        <p className="mb-3 text-[13px] text-soft">Signed in as <b className="text-ink">{user?.email}</b></p>
        <Segmented className="mb-4 w-full [&>button]:flex-1" value={tab} onChange={setTab} options={[{ value: 'create', label: 'Start a household' }, { value: 'join', label: 'Join my partner' }]} />
        {tab === 'create' ? (
          <form className="space-y-3" onSubmit={create}>
            <Users size={18} className="text-gold" />
            <Field label="Household name"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Member 1"><Input required value={a} onChange={(e) => setA(e.target.value)} /></Field>
              <Field label="Member 2"><Input required value={b} onChange={(e) => setB(e.target.value)} /></Field>
            </div>
            <Field label="I am"><Select value={me} onChange={(e) => setMe(e.target.value)}><option value="a">{a || 'Member 1'}</option><option value="b">{b || 'Member 2'}</option></Select></Field>
            {err && <div className="rounded-lg bg-rust-soft px-3 py-2 text-[13px] text-rust">{err}</div>}
            <Btn variant="primary" type="submit" className="w-full" disabled={busy || !a.trim() || !b.trim() || a.trim() === b.trim()}>Create household</Btn>
            <p className="text-[12px] text-muted">You will get an invite code in Settings to share with your partner.</p>
          </form>
        ) : (
          <form className="space-y-3" onSubmit={join}>
            <KeyRound size={18} className="text-gold" />
            <Field label="Invite code" hint="Shown in Settings on your partner's device"><Input required value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} className="tracking-widest" placeholder="ABCD1234" /></Field>
            <Field label="I am (exactly as the household names them)"><Input required value={joinMe} onChange={(e) => setJoinMe(e.target.value)} placeholder="e.g. Sujata" /></Field>
            {err && <div className="rounded-lg bg-rust-soft px-3 py-2 text-[13px] text-rust">{err}</div>}
            <Btn variant="primary" type="submit" className="w-full" disabled={busy || !code || !joinMe}>Join household</Btn>
          </form>
        )}
        <div className="mt-4 text-center text-[12.5px] text-soft"><button className="underline" onClick={onSignOut}><Mail size={12} className="mr-1 inline" />Sign out</button></div>
      </Panel>
    </Frame>
  )
}
