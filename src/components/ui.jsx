import { Children, cloneElement, isValidElement, useEffect, useRef, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { X, Trash2, Check } from 'lucide-react'
import { inr } from '../lib/format.js'

export const cx = (...a) => a.filter(Boolean).join(' ')

export function PageHeader({ title, subtitle, actions, children }) {
  return (
    <div className="mb-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[26px] font-semibold leading-tight tracking-tight md:text-[30px]">{title}</h1>
          {subtitle && <p className="mt-1 text-[13px] text-soft">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  )
}

export function Tabs({ items }) {
  return (
    <nav className="scroll-x -mx-1 mb-5 flex gap-1 border-b border-line px-1" aria-label="Sections">
      {items.map((t) => (
        <NavLink key={t.to} to={t.to} end={t.end}
          className={({ isActive }) => cx('whitespace-nowrap border-b-2 px-3 pb-2.5 pt-1 text-[13.5px] font-medium transition',
            isActive ? 'border-gold-fill text-ink' : 'border-transparent text-soft hover:text-ink')}>
          {t.label}
        </NavLink>
      ))}
    </nav>
  )
}

export function Card({ title, subtitle, action, children, className, pad = true, id }) {
  return (
    <section id={id} className={cx('rounded-xl border border-line bg-surface', pad && 'p-4 md:p-5', className)}>
      {(title || action) && (
        <div className={cx('flex items-start justify-between gap-3', pad ? 'mb-3.5' : 'px-4 pt-4 md:px-5 md:pt-5 mb-3')}>
          <div>
            {title && <h2 className="text-[11.5px] font-semibold uppercase tracking-wider text-muted">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-[12px] text-soft">{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

const TONE = { pos: 'text-sage', neg: 'text-rust', neutral: 'text-ink', gold: 'text-gold' }
export function Stat({ label, value, sub, tone = 'neutral', big }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">{label}</div>
      <div className={cx('mt-1 truncate font-semibold tracking-tight', big ? 'text-[30px] md:text-[34px]' : 'text-[20px] md:text-[22px]', TONE[tone])}>{value}</div>
      {sub && <div className="mt-0.5 text-[12px] text-soft">{sub}</div>}
    </div>
  )
}

export function StatStrip({ children, cols = 4 }) {
  const grid = { 2: 'grid-cols-2', 3: 'grid-cols-2 md:grid-cols-3', 4: 'grid-cols-2 md:grid-cols-4', 5: 'grid-cols-2 md:grid-cols-5' }[cols]
  return <div className={cx('mb-5 grid gap-x-6 gap-y-5 rounded-xl border border-line bg-surface p-4 md:p-5', grid)}>{children}</div>
}

export function Field({ label, hint, children, className, error }) {
  return (
    <label className={cx('block min-w-0', className)}>
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted">{label}</span>
      {children}
      {hint && !error && <span className="mt-1 block text-[11.5px] text-muted">{hint}</span>}
      {error && <span className="mt-1 block text-[12px] text-rust">{error}</span>}
    </label>
  )
}
export const Input = ({ className, ...p }) => <input className={cx('field-input', className)} {...p} />
export const Select = ({ className, children, ...p }) => <select className={cx('field-input', className)} {...p}>{children}</select>
export const Textarea = ({ className, ...p }) => <textarea className={cx('field-input', className)} rows={2} {...p} />

export function Btn({ variant = 'secondary', size, className, ...p }) {
  return <button className={cx('btn', `btn-${variant}`, size === 'sm' && 'btn-sm', className)} {...p} />
}

export function Badge({ tone = 'neutral', children, className }) {
  const t = {
    neutral: 'bg-sunken text-soft border-line', gold: 'bg-gold-soft text-gold border-gold-fill/40',
    sage: 'bg-sage-soft text-sage border-sage/30', rust: 'bg-rust-soft text-rust border-rust/30', sky: 'bg-sky-soft text-soft border-line',
  }[tone]
  return <span className={cx('inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11.5px] font-medium', t, className)}>{children}</span>
}

export function PersonTag({ name }) {
  if (!name) return <span className="text-muted">—</span>
  const tone = name === 'Joint' ? 'sky' : name.length % 2 ? 'gold' : 'sage'
  return <Badge tone={tone}>{name}</Badge>
}

export function Progress({ value, tone = 'sage', height = 8, track }) {
  const v = Math.max(0, Math.min(100, value || 0))
  const bg = { sage: 'bg-sage', gold: 'bg-gold-fill', rust: 'bg-rust', blue: 'bg-[var(--s1)]' }[tone]
  return (
    <div className="w-full overflow-hidden rounded-full bg-sunken" style={{ height }} role="progressbar" aria-valuenow={Math.round(v)} aria-valuemin={0} aria-valuemax={100}>
      <div className={cx('h-full rounded-full transition-[width]', bg, track)} style={{ width: `${v}%` }} />
    </div>
  )
}

export function Empty({ title, hint, action }) {
  return (
    <div className="rounded-lg border border-dashed border-line-strong px-4 py-8 text-center">
      <div className="text-[14px] font-medium">{title}</div>
      {hint && <div className="mx-auto mt-1 max-w-md text-[13px] text-soft">{hint}</div>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  )
}

export function Modal({ open, onClose, title, children, wide, footer }) {
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = '' }
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div ref={ref} className={cx('relative flex max-h-[92dvh] w-full flex-col rounded-t-2xl border border-line bg-surface shadow-xl md:rounded-2xl', wide ? 'md:max-w-3xl' : 'md:max-w-lg')}>
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <h2 className="font-display text-[19px] font-semibold">{title}</h2>
          <button onClick={onClose} className="rounded-md p-1.5 text-soft hover:bg-sunken" aria-label="Close"><X size={18} /></button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
      </div>
    </div>
  )
}

/** Delete button that asks "sure?" inline - no browser confirm() pop-ups. */
export function ConfirmDelete({ onConfirm, label = 'Delete', confirmLabel = 'Confirm', icon = true, size = 'sm', variant = 'ghost', title }) {
  const [armed, setArmed] = useState(false)
  useEffect(() => { if (!armed) return; const t = setTimeout(() => setArmed(false), 3500); return () => clearTimeout(t) }, [armed])
  if (armed) return <Btn variant="danger" size={size} onClick={() => { setArmed(false); onConfirm() }}><Check size={14} />{confirmLabel}</Btn>
  return (
    <Btn variant={variant} size={size} onClick={() => setArmed(true)} title={title || label} aria-label={label}>
      {icon && <Trash2 size={14} />}{label && !icon ? label : icon && label !== 'Delete' ? label : null}
    </Btn>
  )
}

export function Segmented({ value, onChange, options, className }) {
  return (
    <div className={cx('inline-flex max-w-full overflow-x-auto rounded-lg border border-line-strong bg-sunken p-0.5 [scrollbar-width:none]', className)} role="tablist">
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={value === o.value} onClick={() => onChange(o.value)}
          className={cx('shrink-0 whitespace-nowrap rounded-md px-3 py-1.5 text-[13px] font-medium transition', value === o.value ? 'bg-surface text-ink shadow-sm' : 'text-soft hover:text-ink')}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Money({ v, sign, className }) { return <span className={cx('tnum', className)}>{inr(v, { sign })}</span> }

/**
 * Data table. Wide screens get a normal table; on a phone every row becomes a small card,
 * with each cell labelled by its column heading (so no amount or button is ever scrolled out of sight).
 */
export function Table({ head, children, empty, className, stack = true }) {
  const labels = head.map((h) => (typeof h === 'string' ? h : h.label ?? ''))
  const rows = stack ? Children.map(children, (tr) => {
    if (!isValidElement(tr) || tr.type !== 'tr') return tr
    let i = -1
    return cloneElement(tr, {}, Children.map(tr.props.children, (td) => { if (!isValidElement(td)) return td; i += 1; return cloneElement(td, { 'data-label': labels[i] || undefined }) }))
  }) : children
  return (
    <div className={cx('scroll-x', className)}>
      <table className={cx('w-full border-collapse text-[13.5px]', stack ? 'stack md:min-w-[520px]' : 'min-w-[520px]')}>
        <thead><tr>{head.map((h, i) => <th key={i} className={cx('th', h.right && 'text-right')}>{h.label ?? h}</th>)}</tr></thead>
        <tbody>{rows}</tbody>
      </table>
      {empty}
    </div>
  )
}
