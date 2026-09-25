import { RefreshCw } from 'lucide-react'
import { useData } from '../../ctx/DataContext.jsx'
import { Btn, Card, Stat, StatStrip } from '../../components/ui.jsx'
import { CLASS_COLOR, ChartCard, HBars, ShareBar, TimeChart, slot } from '../../components/charts.jsx'
import { groupSum, monthlyInvestmentSeries, snapshotOf } from '../../lib/portfolio.js'
import { monthlySipTotal } from '../../lib/schedule.js'
import { inr, inrCompact, pct } from '../../lib/format.js'
import { dateLabel, dateShort, lastMonths, monthLabel, monthShort, ym } from '../../lib/dates.js'

export default function InvestDashboard() {
  const { data, derived, today, refreshPrices, busy, owners } = useData()
  const { holdings, totals } = derived
  const byClass = groupSum(holdings, (h) => h.assetClass)
  const byPerson = groupSum(holdings, (h) => h.person || 'Unassigned')
  const byCat = groupSum(holdings.filter((h) => h.asset_type !== 'equity'), (h) => h.category || 'Uncategorised').slice(0, 8)
  const top = [...holdings].sort((a, b) => b.value - a.value).slice(0, 6).map((h) => ({ name: h.name, value: h.value, sub: h.person }))
  const months = lastMonths(ym(today), 12)
  const flow = monthlyInvestmentSeries(months, data.sip_installments, data.investment_txns).map((m) => ({ label: monthShort(m.month), month: m.month, SIPs: Math.round(m.sip), 'Additional': Math.round(m.additional) }))

  // value history: stored daily snapshots + today's live figure
  const snaps = [...data.portfolio_snapshots].filter((s) => s.date < today).sort((a, b) => (a.date < b.date ? -1 : 1)).map((s) => ({ date: s.date, value: Number(s.total_value) }))
  const hist = [...snaps, { date: today, value: Math.round(totals.value) }].map((s) => ({ ...s, label: dateShort(s.date) }))
  const priceDates = holdings.map((h) => h.price_date).filter(Boolean).sort()
  const latest = priceDates[priceDates.length - 1]
  const stale = latest && (Date.parse(today) - Date.parse(latest)) / 864e5 > 4
  const totalSip = monthlySipTotal(data.sip_master)

  return (
    <>
      <StatStrip cols={4}>
        <Stat big label="Portfolio value" value={inr(totals.value)} sub={latest ? `prices as of ${dateLabel(latest)}${stale ? ' · out of date' : ''}` : 'no live prices yet'} />
        <Stat label="Invested" value={inrCompact(totals.costKnownInvested)} sub={totals.unknownCostValue > 0 ? `+ ${inrCompact(totals.unknownCostValue)} with no cost on record` : 'at cost'} />
        <Stat label="Gain" value={inr(totals.gain, { sign: true })} sub={totals.costKnownInvested > 0 ? pct(totals.gainPct) : undefined} tone={totals.gain >= 0 ? 'pos' : 'neg'} />
        <Stat label="SIP per month" value={inr(totalSip)} sub={`${totals.value > 0 ? ((totalSip * 12) / totals.value * 100).toFixed(0) : 0}% of the portfolio per year`} />
      </StatStrip>

      <div className="mb-3 flex items-center justify-between gap-3 text-[12.5px] text-soft">
        <span>Updated automatically every day{stale ? ' - prices look stale, try refreshing.' : '.'}</span>
        <Btn size="sm" onClick={refreshPrices} disabled={busy}><RefreshCw size={14} className={busy ? 'animate-spin' : ''} />Refresh prices</Btn>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Portfolio value over time" className="lg:col-span-2" table={{ head: ['Date', 'Value'], rows: hist.map((h) => [dateLabel(h.date), inr(h.value)]) }}>
          {hist.length < 3 ? <p className="py-10 text-center text-[13px] text-muted">The history builds up day by day once the daily update is running.</p>
            : <TimeChart type="area" data={hist} series={[{ key: 'value', label: 'Portfolio value' }]} height={220} />}
        </ChartCard>

        <Card title="Asset allocation"><ShareBar items={byClass} colorOf={(it) => CLASS_COLOR[it.name] || 'var(--s5)'} /></Card>
        <Card title="Whose money"><HBars items={byPerson} colorOf={(it) => slot(Math.max(owners.indexOf(it.name), 0))} showShare /></Card>

        <ChartCard title="Money put in each month" subtitle={`SIPs post automatically; "Additional" is what you entered`} table={{ head: ['Month', 'SIPs', 'Additional'], rows: flow.map((m) => [monthLabel(m.month), inr(m.SIPs), inr(m.Additional)]) }}>
          <TimeChart type="bar" data={flow} series={[{ key: 'SIPs', label: 'SIPs' }, { key: 'Additional', label: 'Additional' }]} height={210} />
        </ChartCard>
        <Card title="Largest holdings"><HBars items={top} color="var(--s1)" showShare empty="Add investments to see them here." /></Card>
        <Card title="By category" className="lg:col-span-2"><HBars items={byCat} color="var(--s1)" showShare empty="No categorised funds yet." /></Card>
      </div>
    </>
  )
}
