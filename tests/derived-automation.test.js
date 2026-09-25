import { describe, it, expect } from 'vitest'
import { computeAutomation, withApproxNav } from '../src/lib/automation.js'
import { buildDerived, monthCashflow, avgSurplus } from '../src/lib/derived.js'
import { seedDemo } from '../src/data/seed.js'
import { demoStore } from '../src/data/demoStore.js'
import { runAutomation } from '../src/lib/automation.js'
import { emptyData } from '../src/data/tables.js'

const today = '2026-09-20'
const load = async () => { const s = demoStore({ today, persist: false }); return { s, data: await s.loadAll() } }

describe('automation with the demo household', () => {
  it('posts every due SIP installment and EMI once, and nothing twice', async () => {
    const { s, data } = await load()
    const first = await runAutomation(s, data, today)
    expect(first.sip.length).toBeGreaterThan(20)         // 5 SIPs x ~5-6 months
    expect(first.emi.length).toBeGreaterThan(8)          // 3 loans x ~3-4 months
    const again = await runAutomation(s, await s.loadAll(), today)
    expect(again.sip.length).toBe(0); expect(again.emi.length).toBe(0)
  })

  it('never posts a future installment', async () => {
    const { s, data } = await load()
    await runAutomation(s, data, today)
    const after = await s.loadAll()
    expect(after.sip_installments.every((i) => i.due_date <= today)).toBe(true)
    expect(after.emi_payments.every((p) => p.due_date <= today)).toBe(true)
  })

  it('a deleted (skipped) SIP installment stays deleted after the job runs again', async () => {
    const { s, data } = await load()
    await runAutomation(s, data, today)
    let d = await s.loadAll()
    const victim = d.sip_installments.find((i) => i.sip_id === 's-ppfc')
    await s.update('sip_installments', victim.id, { status: 'skipped' })
    await runAutomation(s, await s.loadAll(), today)
    d = await s.loadAll()
    expect(d.sip_installments.filter((i) => i.sip_id === 's-ppfc' && i.due_date === victim.due_date)).toHaveLength(1)
    expect(d.sip_installments.find((i) => i.id === victim.id).status).toBe('skipped')
  })

  it('a SIP added later with an older start date back-fills, then advances with the calendar', async () => {
    const s = demoStore({ today, persist: false })
    await s.insert('sip_master', { fund_name: 'X', amount: 1000, sip_day: 31, start_date: '2026-06-15', active: true })
    await runAutomation(s, await s.loadAll(), today)
    const rows = (await s.loadAll()).sip_installments.filter((i) => i.amount === 1000).map((i) => i.due_date).sort()
    expect(rows).toEqual(['2026-06-30', '2026-07-31', '2026-08-31'])
    await runAutomation(s, await s.loadAll(), '2026-09-30')
    expect((await s.loadAll()).sip_installments.filter((i) => i.amount === 1000)).toHaveLength(4)
  })

  it('outstanding balance falls by principal as EMIs auto-post', async () => {
    const { s, data } = await load()
    const before = buildDerived(data, today)
    await runAutomation(s, data, today)
    const after = buildDerived(await s.loadAll(), today)
    const b = before.loans.find((l) => l.loan.id === 'l-car'), a = after.loans.find((l) => l.loan.id === 'l-car')
    // before automation the engine already assumes due EMIs are paid; the balance must match afterwards
    expect(a.summary.balanceToday).toBeCloseTo(b.summary.balanceToday, 4)
    expect(a.summary.balanceToday).toBeLessThan(a.loan.outstanding_amount)
  })

  it('approximate NAV is applied only when the holding price is recent', () => {
    const sips = [{ id: 's', holding_id: 'h' }]
    const rows = [{ sip_id: 's', due_date: '2026-09-18', amount: 1000 }]
    expect(withApproxNav(rows, sips, [{ id: 'h', price: 50, price_date: '2026-09-20' }])[0]).toMatchObject({ nav: 50, units: 20, nav_date: '2026-09-20' })
    expect(withApproxNav(rows, sips, [{ id: 'h', price: 50, price_date: '2026-10-20' }])[0].units).toBeUndefined()
  })
})

describe('derived dashboard numbers', () => {
  it('cash-flow adds up', async () => {
    const { s, data } = await load()
    await runAutomation(s, data, today)
    const d = await s.loadAll()
    const cf = monthCashflow(d, '2026-08')
    expect(cf.income).toBeGreaterThan(200000)
    expect(cf.sip).toBe(33000)
    expect(cf.leftover).toBeCloseTo(cf.income - cf.expenses - cf.emi - cf.invested, 6)
  })
  it('net worth = assets - loans and portfolio value comes from units x price', async () => {
    const { s, data } = await load()
    await runAutomation(s, data, today)
    const dv = buildDerived(await s.loadAll(), today)
    expect(dv.netWorth).toBeCloseTo(dv.totals.value - dv.debt, 6)
    expect(dv.holdings.find((h) => h.id === 'h-nifty').value).toBeGreaterThan(60000)
    expect(dv.debt).toBeGreaterThan(3_000_000)
  })
  it('average surplus is null with no income data', () => { expect(avgSurplus(emptyData(), today)).toBeNull() })
  it('seed data is deterministic', () => { expect(seedDemo(today).tables.expenses.length).toBe(seedDemo(today).tables.expenses.length) })
})
