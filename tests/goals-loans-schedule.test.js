import { describe, it, expect } from 'vitest'
import { requiredSip, fvSip, fvLumpsum, projectGoal, requiredLumpsum, monthlyRateEff, rateScenarios, goalMonthsLeft } from '../src/lib/goals.js'
import { simulatePlan, compareStrategies, solveForDeadline } from '../src/lib/loans.js'
import { pendingSipRows, upcomingSips } from '../src/lib/schedule.js'
import { monthlyDates, dateInMonth, nextOccurrenceAfter, monthsUntil, todayISO } from '../src/lib/dates.js'

describe('dates', () => {
  it('monthlyDates clamps day 31', () => {
    expect(monthlyDates(31, '2026-01-01', '2026-04-30')).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30'])
  })
  it('respects the interval bounds', () => {
    expect(monthlyDates(10, '2026-01-11', '2026-03-10')).toEqual(['2026-02-10', '2026-03-10'])
    expect(monthlyDates(10, '2026-05-01', '2026-04-30')).toEqual([])
  })
  it('leap years', () => { expect(dateInMonth('2028-02', 30)).toBe('2028-02-29') })
  it('next occurrence', () => {
    expect(nextOccurrenceAfter(5, '2026-01-05')).toBe('2026-02-05')
    expect(nextOccurrenceAfter(5, '2026-01-04')).toBe('2026-01-05')
    expect(nextOccurrenceAfter(31, '2026-01-31')).toBe('2026-02-28')
  })
  it('monthsUntil rounds partial months up', () => {
    expect(monthsUntil('2026-01-15', '2027-01-15')).toBe(12)
    expect(monthsUntil('2026-01-15', '2027-01-20')).toBe(13)
    expect(monthsUntil('2026-01-15', '2026-01-10')).toBe(0)
  })
  it('todayISO is an ISO date in IST', () => {
    expect(todayISO(new Date('2026-09-20T20:00:00Z'))).toBe('2026-09-21') // 01:30 IST next day
    expect(todayISO(new Date('2026-09-20T10:00:00Z'))).toBe('2026-09-20')
  })
})

describe('goal maths', () => {
  it('effective monthly rate compounds to the annual rate', () => {
    expect(Math.pow(1 + monthlyRateEff(12), 12)).toBeCloseTo(1.12, 10)
  })
  it('required SIP funds the target exactly', () => {
    const r = requiredSip({ target: 5_000_000, annualPct: 12, months: 120 })
    expect(fvSip(r.sip, 12, 120)).toBeCloseTo(5_000_000, 0)
    expect(r.sip).toBeGreaterThan(15000)
    expect(r.sip).toBeLessThan(25000)
  })
  it('existing corpus lowers the required SIP', () => {
    const a = requiredSip({ target: 1_000_000, annualPct: 10, months: 60 })
    const b = requiredSip({ target: 1_000_000, corpus: 300_000, annualPct: 10, months: 60 })
    expect(b.sip).toBeLessThan(a.sip)
    expect(fvLumpsum(300_000, 10, 60) + fvSip(b.sip, 10, 60)).toBeCloseTo(1_000_000, 0)
  })
  it('returns 0 when the corpus alone will reach the goal', () => {
    const r = requiredSip({ target: 100_000, corpus: 100_000, annualPct: 10, months: 60 })
    expect(r.sip).toBe(0); expect(r.achieved).toBe(true)
  })
  it('inflation raises the target', () => {
    const a = requiredSip({ target: 1_000_000, annualPct: 10, months: 120, inflationPct: 0 })
    const b = requiredSip({ target: 1_000_000, annualPct: 10, months: 120, inflationPct: 6 })
    expect(b.adjustedTarget).toBeCloseTo(1_000_000 * Math.pow(1.06, 10), 2)
    expect(b.sip).toBeGreaterThan(a.sip)
  })
  it('step-up lowers the starting SIP and still reaches the target', () => {
    const flat = requiredSip({ target: 5_000_000, annualPct: 12, months: 120 })
    const step = requiredSip({ target: 5_000_000, annualPct: 12, months: 120, stepUpPct: 10 })
    expect(step.sip).toBeLessThan(flat.sip)
    expect(fvSip(step.sip, 12, 120, 10)).toBeCloseTo(5_000_000, 0)
  })
  it('higher return needs a smaller SIP (scenarios are monotone)', () => {
    const s = rateScenarios({ target: 2_000_000, months: 96 })
    for (let i = 1; i < s.length; i++) expect(s[i].sip).toBeLessThan(s[i - 1].sip)
  })
  it('lumpsum equivalent', () => {
    const l = requiredLumpsum({ target: 1_000_000, annualPct: 10, months: 60 })
    expect(fvLumpsum(l, 10, 60)).toBeCloseTo(1_000_000, 2)
  })
  it('projection status', () => {
    const ok = projectGoal({ target: 1_000_000, corpus: 0, currentSip: 30000, annualPct: 10, months: 60 })
    expect(ok.status).toBe('on_track')
    const bad = projectGoal({ target: 1_000_000, corpus: 0, currentSip: 5000, annualPct: 10, months: 60 })
    expect(bad.status).toBe('behind')
    expect(bad.shortfall).toBeGreaterThan(0)
  })
  it('a month-only target date is handled', () => {
    expect(goalMonthsLeft('2027-03', '2026-09-20')).toBeGreaterThan(5)
    expect(goalMonthsLeft(null, '2026-09-20')).toBe(0)
  })
})

describe('SIP schedule', () => {
  const sip = { id: 's1', household_id: 'h', amount: 5000, sip_day: 5, start_date: '2026-06-01', active: true }
  it('creates one paid installment per month since start', () => {
    const rows = pendingSipRows([sip], [], '2026-09-20')
    expect(rows.map((r) => r.due_date)).toEqual(['2026-06-05', '2026-07-05', '2026-08-05', '2026-09-05'])
    expect(rows.every((r) => r.amount === 5000 && r.status === 'paid' && r.source === 'auto')).toBe(true)
  })
  it('does not create the installment before its date', () => {
    expect(pendingSipRows([sip], [], '2026-09-04').map((r) => r.due_date)).toEqual(['2026-06-05', '2026-07-05', '2026-08-05'])
  })
  it('is idempotent - a deleted (skipped) entry is never re-created', () => {
    const have = [
      { sip_id: 's1', due_date: '2026-06-05', status: 'paid' },
      { sip_id: 's1', due_date: '2026-07-05', status: 'skipped' },
    ]
    expect(pendingSipRows([sip], have, '2026-09-20').map((r) => r.due_date)).toEqual(['2026-08-05', '2026-09-05'])
    expect(pendingSipRows([sip], [...have, { sip_id: 's1', due_date: '2026-08-05' }, { sip_id: 's1', due_date: '2026-09-05' }], '2026-09-20')).toEqual([])
  })
  it('stops at end_date and skips inactive SIPs', () => {
    expect(pendingSipRows([{ ...sip, end_date: '2026-07-31' }], [], '2026-09-20').length).toBe(2)
    expect(pendingSipRows([{ ...sip, active: false }], [], '2026-09-20')).toEqual([])
  })
  it('upcoming list is sorted and bounded', () => {
    const list = upcomingSips([sip, { ...sip, id: 's2', sip_day: 25 }], '2026-09-20', 10)
    expect(list.map((x) => x.date)).toEqual(['2026-09-25'])
  })
})

const loans = [
  { id: 'hl', name: 'Home loan', balance: 3_000_000, rate: 8.5, emi: 30000, taxDeductible: true },
  { id: 'pl', name: 'Personal loan', balance: 300_000, rate: 14, emi: 10000 },
  { id: 'cl', name: 'Car loan', balance: 500_000, rate: 9.5, emi: 12000 },
]
describe('loan optimiser', () => {
  it('baseline just runs each loan out', () => {
    const b = simulatePlan(loans, { order: 'baseline', startISO: '2026-10-01' })
    expect(b.done).toBe(true)
    const pl = b.closures.find((c) => c.id === 'pl')
    expect(pl.month).toBeGreaterThan(30); expect(pl.month).toBeLessThan(40)
  })
  it('extra money reduces months and interest; avalanche <= snowball interest', () => {
    const cmp = compareStrategies(loans, { extraMonthly: 10000, startISO: '2026-10-01' })
    const by = Object.fromEntries(cmp.map((c) => [c.key, c]))
    expect(by.avalanche.sim.months).toBeLessThan(by.baseline.sim.months)
    expect(by.avalanche.sim.totalInterest).toBeLessThanOrEqual(by.snowball.sim.totalInterest + 1e-6)
    expect(by.avalanche.interestSaved).toBeGreaterThan(0)
    expect(by.avalanche.monthsSaved).toBeGreaterThan(0)
  })
  it('avalanche closes the highest-rate loan first; snowball the smallest balance', () => {
    const cmp = compareStrategies(loans, { extraMonthly: 20000, startISO: '2026-10-01' })
    const first = (k) => cmp.find((c) => c.key === k).sim.closures.filter((c) => c.month != null).sort((a, b) => a.month - b.month)[0].id
    expect(first('avalanche')).toBe('pl')
    expect(first('snowball')).toBe('pl')
  })
  it('tax-aware ranks a deductible loan below an equal-rate non-deductible one', () => {
    const two = [
      { id: 'a', name: 'Home', balance: 1_000_000, rate: 9, emi: 12000, taxDeductible: true },
      { id: 'b', name: 'Car', balance: 1_000_000, rate: 9, emi: 12000, taxDeductible: false },
    ]
    const sim = simulatePlan(two, { order: 'tax', extraMonthly: 20000, startISO: '2026-10-01' })
    const m = Object.fromEntries(sim.closures.map((c) => [c.id, c.month]))
    expect(m.b).toBeLessThan(m.a)
  })
  it('conserves money: total paid = principal + interest', () => {
    const s = simulatePlan(loans, { order: 'avalanche', extraMonthly: 15000, lumpSum: 100000, startISO: '2026-10-01' })
    const principal = loans.reduce((t, l) => t + l.balance, 0)
    expect(s.totalPaid).toBeCloseTo(principal + s.totalInterest, 3)
  })
  it('monthly outlay stays constant until debt free (rollover)', () => {
    const s = simulatePlan(loans, { order: 'avalanche', extraMonthly: 5000, startISO: '2026-10-01' })
    const inFull = s.plan.slice(0, s.plan.length - 1)
    for (const p of inFull) expect(p.outlay).toBeCloseTo(52000 + 5000, 4)
  })
  it('lump sum today shortens the plan', () => {
    const a = simulatePlan(loans, { order: 'avalanche', startISO: '2026-10-01' })
    const b = simulatePlan(loans, { order: 'avalanche', lumpSum: 500_000, startISO: '2026-10-01' })
    expect(b.months).toBeLessThan(a.months)
    expect(b.lumpApplied).toBe(500_000)
  })
  it('a lump sum bigger than everything clears the debt immediately', () => {
    const s = simulatePlan(loans, { order: 'avalanche', lumpSum: 10_000_000, startISO: '2026-10-01' })
    expect(s.months).toBe(0)
    expect(s.done).toBe(true)
  })
})

describe('deadline solver', () => {
  const base = simulatePlan(loans, { order: 'baseline', startISO: '2026-10-01' })
  it('finds funding options that really finish in time - and not with a smaller amount', () => {
    const target = 48
    expect(base.months).toBeGreaterThan(target)
    const opts = solveForDeadline(loans, target, { startISO: '2026-10-01' })
    expect(opts.map((o) => o.mode)).toEqual(['monthly', 'lump', 'balanced', 'stepup'])
    for (const o of opts) {
      expect(o.sim.done).toBe(true)
      expect(o.sim.months).toBeLessThanOrEqual(target)
    }
    const m = opts.find((o) => o.mode === 'monthly')
    const slightlyLess = simulatePlan(loans, { order: 'avalanche', extraMonthly: m.extraMonthly - 200, startISO: '2026-10-01' })
    expect(slightlyLess.months).toBeGreaterThan(target)
    // step-up starts lower than flat monthly, lump only has no monthly extra
    expect(opts.find((o) => o.mode === 'stepup').extraMonthly).toBeLessThan(m.extraMonthly)
    expect(opts.find((o) => o.mode === 'lump').extraMonthly ?? 0).toBe(0)
  })
  it('says so when no extra is needed', () => {
    const opts = solveForDeadline(loans, 200, { startISO: '2026-10-01' })
    expect(opts).toHaveLength(1)
    expect(opts[0].extraMonthly).toBe(0)
  })
})
