import { useEffect, useState } from 'react'
import { Copy, Download, RefreshCw, RotateCcw, Smartphone, Users } from 'lucide-react'
import { useData } from '../ctx/DataContext.jsx'
import { Badge, Btn, Card, Field, Input, PageHeader, Segmented } from '../components/ui.jsx'
import { currentTheme } from '../components/Shell.jsx'
import { DEFAULT_ASSUMPTIONS } from '../lib/avenues.js'
import { TABLES } from '../data/tables.js'
import { dateLabel } from '../lib/dates.js'

const ASSUME = [
  ['equity', 'Equity funds / index funds'], ['hybrid', 'Hybrid / balanced advantage'], ['debt', 'Debt funds'], ['liquid', 'Liquid funds / FDs'], ['gold', 'Gold'],
  ['ppf', 'PPF (govt. notified)'], ['ssy', 'Sukanya Samriddhi (govt. notified)'], ['epf', 'EPF'], ['nps', 'NPS (blended)'], ['inflation', 'General inflation'],
]

function InstallCard() {
  const [evt, setEvt] = useState(null)
  const [done, setDone] = useState(false)
  useEffect(() => {
    const on = (e) => { e.preventDefault(); setEvt(e) }
    window.addEventListener('beforeinstallprompt', on)
    window.addEventListener('appinstalled', () => setDone(true))
    return () => window.removeEventListener('beforeinstallprompt', on)
  }, [])
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches
  return (
    <Card title="Install on your phone">
      <div className="flex items-start gap-3 text-[13.5px] text-soft">
        <Smartphone size={20} className="mt-0.5 shrink-0 text-gold" />
        <div>
          {standalone || done ? <p className="text-ink">The Ledger is installed on this device.</p> : evt ? (
            <><p>Add The Ledger to your home screen - it opens full-screen like any app and works offline for the screens you have already opened.</p><Btn variant="primary" className="mt-3" onClick={async () => { evt.prompt(); await evt.userChoice; setEvt(null) }}>Install app</Btn></>
          ) : (
            <ul className="list-disc space-y-1 pl-4">
              <li><b className="text-ink">Android (Chrome):</b> menu ⋮ → <i>Install app</i> / <i>Add to Home screen</i>.</li>
              <li><b className="text-ink">iPhone (Safari):</b> Share → <i>Add to Home Screen</i>.</li>
              <li><b className="text-ink">A real APK</b> for sideloading or the Play Store: see DEPLOY.md → PWABuilder.</li>
            </ul>
          )}
        </div>
      </div>
    </Card>
  )
}

export default function Settings() {
  const { household, settings, saveSettings, renameHousehold, ctx, me, mode, store, data, refreshPrices, busy, notify, exit, derived } = useData()
  const [name, setName] = useState(household?.name || '')
  const [a, setA] = useState(settings.assumptions)
  const [tax, setTax] = useState(settings.taxRelief)
  const [months, setMonths] = useState(settings.surplusMonths)
  const [theme, setTheme] = useState(currentTheme())
  const [jobs, setJobs] = useState(null)

  useEffect(() => {
    if (mode !== 'supabase') return
    store.sb.from('job_log').select('*').order('ran_at', { ascending: false }).limit(12).then(({ data: rows, error }) => setJobs(error ? [] : rows || []))
  }, [mode, store, busy])

  const setAssume = (k) => (e) => setA((o) => ({ ...o, [k]: e.target.value === '' ? '' : Number(e.target.value) }))
  const dirty = JSON.stringify(a) !== JSON.stringify(settings.assumptions) || Number(tax) !== settings.taxRelief || Number(months) !== settings.surplusMonths
  const saveAll = async () => { try { await saveSettings({ assumptions: Object.fromEntries(Object.entries(a).map(([k, v]) => [k, Number(v) || 0])), taxRelief: Number(tax) || 0, surplusMonths: Math.max(1, Math.min(12, Number(months) || 3)) }); notify('Settings saved') } catch { /* toast */ } }

  const setThemePref = (t) => {
    setTheme(t)
    if (t === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', t)
    try { t === 'auto' ? localStorage.removeItem('ledger_theme') : localStorage.setItem('ledger_theme', t) } catch { /* ignore */ }
  }

  const exportJson = () => {
    const blob = new Blob([JSON.stringify({ exported_at: new Date().toISOString(), household: { name: household.name, members: household.members }, tables: Object.fromEntries(TABLES.map((t) => [t, data[t]])) }, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob); const el = document.createElement('a'); el.href = url; el.download = `ledger-backup-${new Date().toISOString().slice(0, 10)}.json`; el.click(); URL.revokeObjectURL(url)
  }
  const copy = async (text) => { try { await navigator.clipboard.writeText(text); notify('Copied') } catch { notify('Could not copy - select and copy manually', 'error') } }

  const priceDates = derived.holdings.map((h) => h.price_date).filter(Boolean).sort()
  const members = ctx.members || []
  const resetDemo = () => { store.reset?.(); window.location.reload() }

  return (
    <>
      <PageHeader title="Settings" />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Household">
          <form className="space-y-3" onSubmit={async (e) => { e.preventDefault(); try { await renameHousehold(name.trim()); notify('Name saved') } catch { /* toast */ } }}>
            <Field label="Household name"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
            <Btn type="submit" disabled={!name.trim() || name.trim() === household?.name}>Save name</Btn>
          </form>
          <div className="mt-5 border-t border-line pt-4">
            <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted"><Users size={14} />Members</div>
            <ul className="space-y-1.5 text-[13.5px]">
              {household?.members?.map((m) => (
                <li key={m} className="flex items-center justify-between"><span>{m}</span>{m === me ? <Badge tone="gold">you</Badge> : mode === 'demo' ? null : members.some((x) => x.member_name === m) ? <Badge tone="sage">joined</Badge> : <Badge>not joined yet</Badge>}</li>
              ))}
            </ul>
            {mode === 'supabase' && (
              <div className="mt-4 rounded-lg bg-sunken p-3.5">
                <div className="text-[12px] text-soft">Invite code for your partner</div>
                <div className="mt-1 flex items-center gap-2"><code className="text-[20px] font-semibold tracking-[0.2em]">{household?.invite_code}</code><Btn size="sm" onClick={() => copy(household.invite_code)}><Copy size={13} />Copy</Btn></div>
                <p className="mt-2 text-[12px] text-muted">They open the app, create an account, choose <b>Join my partner</b> and enter this code. Once you have both joined, switch off new sign-ups in Supabase (see DEPLOY.md) so nobody else can register.</p>
              </div>
            )}
          </div>
        </Card>

        <InstallCard />

        <Card title="Planning assumptions" className="lg:col-span-2">
          <p className="mb-4 text-[13px] text-soft">Used for the goal ideas, glide-path mixes and blended returns. These are your assumptions, not forecasts - government scheme rates (PPF, SSY, EPF) are revised by the government, so update them when they change.</p>
          <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-5">
            {ASSUME.map(([k, label]) => <Field key={k} label={`${label} %`}><Input type="number" step="0.05" min="0" max="40" inputMode="decimal" value={a[k]} onChange={setAssume(k)} /></Field>)}
            <Field label="Tax relief on home-loan interest (%)" hint="Used to rank loans in the tax-aware strategy"><Input type="number" min="0" max="50" inputMode="decimal" value={tax} onChange={(e) => setTax(e.target.value)} /></Field>
            <Field label="Surplus = average of last (months)"><Input type="number" min="1" max="12" inputMode="numeric" value={months} onChange={(e) => setMonths(e.target.value)} /></Field>
          </div>
          <div className="mt-4 flex gap-2"><Btn variant="primary" onClick={saveAll} disabled={!dirty}>Save settings</Btn><Btn onClick={() => { setA({ ...DEFAULT_ASSUMPTIONS }); setTax(25); setMonths(3) }}><RotateCcw size={14} />Reset to defaults</Btn></div>
        </Card>

        <Card title="Prices & automation">
          <ul className="space-y-1.5 text-[13.5px] text-soft">
            <li>Latest price on file: <b className="text-ink">{priceDates.length ? dateLabel(priceDates[priceDates.length - 1]) : 'none yet'}</b></li>
            <li>SIP instalments and EMIs are posted whenever the app opens, and by a daily server job.</li>
          </ul>
          <Btn className="mt-3" onClick={refreshPrices} disabled={busy}><RefreshCw size={14} className={busy ? 'animate-spin' : ''} />Refresh prices now</Btn>
          {mode === 'supabase' && (
            <div className="mt-4 border-t border-line pt-3">
              <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">Recent automatic runs</div>
              {jobs == null ? <p className="text-[12.5px] text-muted">Loading…</p> : jobs.length === 0 ? <p className="text-[12.5px] text-muted">No runs recorded yet. The daily job writes here once it has run.</p> : (
                <ul className="space-y-1 text-[12.5px]">{jobs.map((j) => <li key={j.id} className="flex gap-2"><span className={j.ok ? 'text-sage' : 'text-rust'}>{j.ok ? '●' : '▲'}</span><span className="shrink-0 text-muted">{new Date(j.ran_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span><span className="text-soft">{j.task}: {j.message}</span></li>)}</ul>
              )}
            </div>
          )}
        </Card>

        <Card title="Appearance & data">
          <Field label="Theme"><Segmented value={theme} onChange={setThemePref} options={[{ value: 'auto', label: 'Match device' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} /></Field>
          <div className="mt-5 flex flex-wrap gap-2">
            <Btn onClick={exportJson}><Download size={14} />Download a backup (JSON)</Btn>
            {mode === 'demo' && <Btn variant="danger" onClick={resetDemo}><RotateCcw size={14} />Reset demo data</Btn>}
            <Btn onClick={exit}>{mode === 'demo' ? 'Leave demo' : 'Sign out'}</Btn>
          </div>
          <p className="mt-3 text-[12px] text-muted">Signed in as {ctx.user?.email}. Supabase keeps daily backups on paid plans; a monthly JSON download is a cheap safety net on the free plan.</p>
        </Card>
      </div>
    </>
  )
}
