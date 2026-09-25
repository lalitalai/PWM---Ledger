// Chart building blocks. Follows the dataviz rules: fixed-order categorical slots (never cycled),
// one axis, thin marks, 2px gaps between stacked fills, legend for 2+ series, hover tooltip,
// and a "table" view so nothing is colour-only.
import { useState } from 'react'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, ReferenceLine } from 'recharts'
import { Table2, BarChart3 } from 'lucide-react'
import { inrCompact, inr } from '../lib/format.js'
import { cx } from './ui.jsx'

export const slot = (i) => `var(--s${(i % 8) + 1})`
// Colour follows the entity, never the rank: an asset class keeps its colour on every screen.
export const CLASS_COLOR = { Equity: 'var(--s1)', Debt: 'var(--s3)', Hybrid: 'var(--s7)', Gold: 'var(--s4)', Other: 'var(--s5)' }

export function Legend({ items, className }) {
  return (
    <ul className={cx('flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-soft', className)}>
      {items.map((it) => (
        <li key={it.label} className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-[3px]" style={{ background: it.color }} />{it.label}
        </li>
      ))}
    </ul>
  )
}

/** Card with a chart/table toggle in the header. `table` = { head:[..], rows:[[..]] } */
export function ChartCard({ title, subtitle, table, children, className, right }) {
  const [view, setView] = useState('chart')
  return (
    <section className={cx('rounded-xl border border-line bg-surface p-4 md:p-5', className)}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[11.5px] font-semibold uppercase tracking-wider text-muted">{title}</h2>
          {subtitle && <p className="mt-0.5 text-[12px] text-soft">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-1">
          {right}
          {table && (
            <button onClick={() => setView(view === 'chart' ? 'table' : 'chart')} className="rounded-md p-1.5 text-muted hover:bg-sunken hover:text-ink"
              aria-label={view === 'chart' ? 'Show as table' : 'Show as chart'} title={view === 'chart' ? 'Show as table' : 'Show as chart'}>
              {view === 'chart' ? <Table2 size={16} /> : <BarChart3 size={16} />}
            </button>
          )}
        </div>
      </div>
      {view === 'table' && table ? (
        <div className="scroll-x max-h-72 overflow-y-auto">
          <table className="w-full text-[13px]">
            <thead><tr>{table.head.map((h, i) => <th key={i} className={cx('th', i > 0 && 'text-right')}>{h}</th>)}</tr></thead>
            <tbody>{table.rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className={cx('td tnum', j > 0 && 'text-right')}>{c}</td>)}</tr>)}</tbody>
          </table>
        </div>
      ) : children}
    </section>
  )
}

function TipBox({ active, payload, label, fmt, labelFmt, total }) {
  if (!active || !payload?.length) return null
  const rows = payload.filter((p) => p.value != null)
  return (
    <div className="rounded-lg border border-line-strong bg-surface px-3 py-2 text-[12.5px] shadow-lg">
      <div className="mb-1 font-medium text-ink">{labelFmt ? labelFmt(label) : label}</div>
      {rows.map((p) => (
        <div key={p.dataKey} className="flex items-center justify-between gap-4">
          <span className="inline-flex items-center gap-1.5 text-soft"><span className="h-2 w-2 rounded-sm" style={{ background: p.color || p.stroke || p.fill }} />{p.name}</span>
          <span className="tnum font-medium text-ink">{fmt(p.value)}</span>
        </div>
      ))}
      {total && rows.length > 1 && (
        <div className="mt-1 flex justify-between gap-4 border-t border-line pt-1"><span className="text-soft">Total</span><span className="tnum font-medium text-ink">{fmt(rows.reduce((s, p) => s + p.value, 0))}</span></div>
      )}
    </div>
  )
}

/**
 * Time-series chart.  type: 'line' | 'area' | 'bar'.   series: [{ key, label, color? }]
 * Bars stack by default when there is more than one series.
 */
export function TimeChart({ data, xKey = 'label', series, type = 'line', stacked, height = 230, fmt = inr, axisFmt = inrCompact, refY, labelFmt, showTotal }) {
  const many = series.length > 1
  const st = stacked ?? many
  const common = { data, margin: { top: 6, right: 8, bottom: 0, left: 0 } }
  const axes = (
    <>
      <CartesianGrid stroke="var(--grid)" vertical={false} />
      <XAxis dataKey={xKey} tickLine={false} axisLine={{ stroke: 'var(--axis)' }} tick={{ fill: 'var(--muted)', fontSize: 11 }} interval="preserveStartEnd" minTickGap={14} />
      <YAxis tickLine={false} axisLine={false} width={54} tick={{ fill: 'var(--muted)', fontSize: 11 }} tickFormatter={axisFmt} />
      <Tooltip content={<TipBox fmt={fmt} labelFmt={labelFmt} total={st && many} />} cursor={type === 'bar' ? { fill: 'var(--sunken)' } : { stroke: 'var(--axis)' }} />
      {refY != null && <ReferenceLine y={refY} stroke="var(--axis)" strokeDasharray="4 3" />}
    </>
  )
  const col = (s, i) => s.color || slot(i)
  let chart
  if (type === 'bar') {
    chart = (
      <BarChart {...common} barCategoryGap={many ? '22%' : '30%'}>
        {axes}
        {series.map((s, i) => (
          <Bar key={s.key} dataKey={s.key} name={s.label} fill={col(s, i)} stackId={st ? 's' : undefined}
            stroke={st ? 'var(--surface)' : undefined} strokeWidth={st ? 2 : 0} radius={st ? (i === series.length - 1 ? [4, 4, 0, 0] : 0) : [4, 4, 0, 0]} isAnimationActive={false} />
        ))}
      </BarChart>
    )
  } else if (type === 'area') {
    chart = (
      <AreaChart {...common}>
        {axes}
        {series.map((s, i) => (
          <Area key={s.key} dataKey={s.key} name={s.label} type="monotone" stroke={col(s, i)} strokeWidth={2} fill={col(s, i)} fillOpacity={0.14}
            stackId={st ? 's' : undefined} dot={false} activeDot={{ r: 4, stroke: 'var(--surface)', strokeWidth: 2 }} isAnimationActive={false} />
        ))}
      </AreaChart>
    )
  } else {
    chart = (
      <LineChart {...common}>
        {axes}
        {series.map((s, i) => (
          <Line key={s.key} dataKey={s.key} name={s.label} type="monotone" stroke={col(s, i)} strokeWidth={2} strokeDasharray={s.dash} dot={false}
            activeDot={{ r: 4, stroke: 'var(--surface)', strokeWidth: 2 }} isAnimationActive={false} connectNulls />
        ))}
      </LineChart>
    )
  }
  return (
    <div>
      {many && <Legend className="mb-2" items={series.map((s, i) => ({ label: s.label, color: col(s, i) }))} />}
      <div style={{ height }} role="img" aria-label={series.map((s) => s.label).join(', ') + ' over time'}>
        <ResponsiveContainer width="100%" height="100%">{chart}</ResponsiveContainer>
      </div>
    </div>
  )
}

/** Ranked horizontal bars (HTML) - the workhorse for "where does it go" questions. */
export function HBars({ items, fmt = inr, color = 'var(--s1)', colorOf, max, showShare, onClick, empty = 'Nothing to show yet.' }) {
  if (!items.length) return <p className="py-6 text-center text-[13px] text-muted">{empty}</p>
  const top = max ?? Math.max(...items.map((i) => i.value), 1)
  const total = items.reduce((s, i) => s + i.value, 0) || 1
  return (
    <ul className="space-y-2.5">
      {items.map((it, idx) => (
        <li key={it.name} className={cx(onClick && 'cursor-pointer')} onClick={onClick ? () => onClick(it) : undefined} title={`${it.name}: ${fmt(it.value)}`}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-[13px]">
            <span className="min-w-0 truncate text-ink">{it.name}{it.sub && <span className="ml-1.5 text-[11.5px] text-muted">{it.sub}</span>}</span>
            <span className="tnum shrink-0 text-soft">{fmt(it.value)}{showShare && <span className="ml-1.5 text-[11.5px] text-muted">{Math.round((it.value / total) * 100)}%</span>}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-sunken">
            <div className="h-full rounded-full" style={{ width: `${Math.max((it.value / top) * 100, it.value > 0 ? 1.5 : 0)}%`, background: colorOf ? colorOf(it, idx) : color }} />
          </div>
        </li>
      ))}
    </ul>
  )
}

/** One 100% stacked bar with 2px gaps and a legend that carries the numbers. */
export function ShareBar({ items, fmt = inr, colorOf }) {
  const total = items.reduce((s, i) => s + i.value, 0)
  if (!(total > 0)) return <p className="py-6 text-center text-[13px] text-muted">Nothing to show yet.</p>
  return (
    <div>
      <div className="flex h-3.5 w-full gap-[2px] overflow-hidden rounded-full" role="img" aria-label={items.map((i) => `${i.name} ${Math.round((i.value / total) * 100)}%`).join(', ')}>
        {items.filter((i) => i.value > 0).map((it, idx) => <div key={it.name} style={{ width: `${(it.value / total) * 100}%`, background: colorOf(it, idx) }} title={`${it.name}: ${fmt(it.value)}`} />)}
      </div>
      <ul className="mt-3 grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
        {items.map((it, idx) => (
          <li key={it.name} className="flex items-center justify-between gap-3 text-[13px]">
            <span className="inline-flex items-center gap-2 text-soft"><span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: colorOf(it, idx) }} />{it.name}</span>
            <span className="tnum text-ink">{fmt(it.value)} <span className="text-[11.5px] text-muted">{Math.round((it.value / total) * 100)}%</span></span>
          </li>
        ))}
      </ul>
    </div>
  )
}
