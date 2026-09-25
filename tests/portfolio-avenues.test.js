import { describe, it, expect } from 'vitest'
import { deriveHolding, deriveHoldings, portfolioTotals, goalCorpus, monthlyInvestmentSeries, goalMonthlySip, snapshotOf } from '../src/lib/portfolio.js'
import { allocationFor, blendedReturn, avenuesFor, DEFAULT_ASSUMPTIONS } from '../src/lib/avenues.js'
import { assetClassOf } from '../src/lib/constants.js'

const mf = { id: 'h1', name: 'Flexi Cap Fund', asset_type: 'mutual_fund', category: 'Flexi Cap', units: 100, invested_amount: 10000, price: 120, baseline_date: '2026-08-31', cost_known: true }

describe('derived holdings', () => {
  it('values a fund as units x latest NAV', () => {
    const d = deriveHolding(mf, {})
    expect(d.value).toBe(12000); expect(d.gain).toBe(2000); expect(d.gainPct).toBeCloseTo(20, 6)
  })
  it('adds SIP installments after the baseline, using stored units', () => {
    const sips = [{ id: 's1', holding_id: 'h1' }]
    const inst = [
      { sip_id: 's1', due_date: '2026-08-05', status: 'paid', amount: 5000, units: 50 },      // before baseline: already inside CAS units
      { sip_id: 's1', due_date: '2026-09-05', status: 'paid', amount: 5000, units: 40, nav: 125 },
      { sip_id: 's1', due_date: '2026-10-05', status: 'skipped', amount: 5000 },              // deleted: ignored
    ]
    const d = deriveHolding(mf, { sips, installments: inst })
    expect(d.units).toBe(140); expect(d.invested).toBe(15000); expect(d.value).toBe(140 * 120)
  })
  it('uses the installment NAV, and falls back to cost when the NAV is not fetched yet', () => {
    const sips = [{ id: 's1', holding_id: 'h1' }]
    const withNav = deriveHolding(mf, { sips, installments: [{ sip_id: 's1', due_date: '2026-09-05', status: 'paid', amount: 6000, nav: 100 }] })
    expect(withNav.units).toBe(160)
    const noNav = deriveHolding(mf, { sips, installments: [{ sip_id: 's1', due_date: '2026-09-05', status: 'paid', amount: 6000 }] })
    expect(noNav.units).toBe(100); expect(noNav.pending).toBe(6000); expect(noNav.value).toBe(12000 + 6000)
  })
  it('additional investment and withdrawal', () => {
    const d = deriveHolding(mf, { txns: [
      { holding_id: 'h1', date: '2026-09-10', kind: 'additional', amount: 12000, units: 100 },
      { holding_id: 'h1', date: '2026-09-11', kind: 'withdrawal', amount: 6000, units: 50 },
    ] })
    expect(d.units).toBe(150)
    // invested: 10000 + 12000 = 22000 ; sold 50/200 = 25% -> 16500
    expect(d.invested).toBeCloseTo(16500, 6)
    expect(d.value).toBe(150 * 120)
  })
  it('non-unit assets (PPF) add contributions to value', () => {
    const ppf = { id: 'p', name: 'PPF', asset_type: 'ppf', invested_amount: 100000, current_value: 130000, baseline_date: '2026-04-01' }
    const d = deriveHolding(ppf, { txns: [{ holding_id: 'p', date: '2026-06-01', kind: 'additional', amount: 10000 }] })
    expect(d.value).toBe(140000); expect(d.invested).toBe(110000)
  })
  it('unknown-cost demat holdings do not distort returns', () => {
    const stock = { id: 's', name: 'ACME', asset_type: 'equity', units: 10, price: 100, invested_amount: 1000, cost_known: false }
    const all = deriveHoldings([mf, stock], {})
    const t = portfolioTotals(all)
    expect(t.value).toBe(13000); expect(t.gain).toBe(2000); expect(t.unknownCostValue).toBe(1000)
    expect(all[1].gain).toBeNull()
  })
  it('classifies asset class', () => {
    expect(assetClassOf({ asset_type: 'mutual_fund', category: 'Liquid' })).toBe('Debt')
    expect(assetClassOf({ asset_type: 'mutual_fund', name: 'Kotak Gold Fund' })).toBe('Gold')
    expect(assetClassOf({ asset_type: 'mutual_fund', category: 'Balanced Advantage' })).toBe('Hybrid')
    expect(assetClassOf({ asset_type: 'mutual_fund', category: 'Small Cap' })).toBe('Equity')
    expect(assetClassOf({ asset_type: 'ppf' })).toBe('Debt')
  })
  it('goal corpus unions direct tags and SIP-linked holdings without double counting', () => {
    const a = { ...mf, id: 'a', goal_id: 'g1' }, b = { ...mf, id: 'b' }, c = { ...mf, id: 'c', goal_id: 'g2' }
    const derived = deriveHoldings([a, b, c], {})
    const sips = [{ id: 's1', holding_id: 'a', goal_id: 'g1', amount: 5000, active: true }, { id: 's2', holding_id: 'b', goal_id: 'g1', amount: 3000, active: true }]
    const r = goalCorpus({ id: 'g1', manual_amount: 500 }, derived, sips)
    expect(r.holdings.map((h) => h.id).sort()).toEqual(['a', 'b'])
    expect(r.invested).toBe(24000 + 500)
    expect(goalMonthlySip('g1', sips)).toBe(8000)
  })
  it('monthly investment series ignores skipped', () => {
    const s = monthlyInvestmentSeries(['2026-08', '2026-09'], [
      { due_date: '2026-08-05', status: 'paid', amount: 100 }, { due_date: '2026-09-05', status: 'skipped', amount: 100 }, { due_date: '2026-09-06', status: 'paid', amount: 50 },
    ], [{ date: '2026-09-09', kind: 'additional', amount: 1000 }, { date: '2026-09-09', kind: 'withdrawal', amount: 400 }])
    expect(s).toEqual([{ month: '2026-08', sip: 100, additional: 0 }, { month: '2026-09', sip: 50, additional: 1000 }])
  })
  it('snapshot groups by class', () => {
    const snap = snapshotOf(deriveHoldings([mf, { ...mf, id: 'x', category: 'Liquid' }], {}), '2026-09-20')
    expect(snap.total_value).toBe(24000); expect(snap.by_class).toEqual({ Equity: 12000, Debt: 12000 })
  })
})

describe('goal avenues', () => {
  it('equity share rises with the horizon and is zero for emergency funds', () => {
    let last = -1
    for (const m of [6, 24, 48, 72, 108, 150, 240]) { const a = allocationFor(m); expect(a.equity).toBeGreaterThanOrEqual(last); last = a.equity; expect(a.equity + a.debt + a.gold).toBe(100) }
    expect(allocationFor(240, 'emergency').equity).toBe(0)
  })
  it('blended return sits between debt and equity assumptions', () => {
    const r = blendedReturn(allocationFor(120)); expect(r).toBeGreaterThan(DEFAULT_ASSUMPTIONS.debt); expect(r).toBeLessThan(DEFAULT_ASSUMPTIONS.equity + 0.01)
  })
  it('suggestions differ by horizon', () => {
    expect(avenuesFor(6).list[0].name).toMatch(/Liquid/)
    expect(avenuesFor(200, 'retirement').list.some((x) => /NPS/.test(x.name))).toBe(true)
    expect(avenuesFor(200).list.some((x) => /PPF/.test(x.name))).toBe(true)
  })
})
