// Sample household used by "Try the demo". Entirely invented - no real people, banks balances or holdings.
import { addMonthsISO, dateInMonth, shiftMonth, ym } from '../lib/dates.js'
import { pmt } from '../lib/amortization.js'

function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 } }

export function seedDemo(today) {
  const HH = 'demo-household'
  const r = rng(20260920)
  const rnd = (a, b) => Math.round(a + r() * (b - a))
  const round50 = (x) => Math.round(x / 50) * 50
  let n = 0
  const id = (p) => `${p}-${++n}`
  const T = (rows) => rows.map((x) => ({ household_id: HH, created_at: new Date().toISOString(), ...x }))
  const thisYM = ym(today)
  const mAgo = (k) => shiftMonth(thisYM, -k)

  // ---- masters --------------------------------------------------------------------------------
  const banks = T([
    { id: 'bk-hdfc', name: 'HDFC Salary', bank_name: 'HDFC Bank', owner: 'Lalit', account_type: 'Salary', last4: '4821', active: true },
    { id: 'bk-sbi', name: 'SBI Savings', bank_name: 'State Bank of India', owner: 'Sujata', account_type: 'Savings', last4: '7305', active: true },
    { id: 'bk-icici', name: 'ICICI Joint', bank_name: 'ICICI Bank', owner: 'Joint', account_type: 'Joint Savings', last4: '1149', active: true },
  ])
  const cards = T([
    { id: 'cc-regalia', name: 'HDFC Regalia', issuing_bank: 'HDFC Bank', credit_limit: 500000, owner: 'Lalit', last4: '2210', billing_day: 18, active: true },
    { id: 'cc-flip', name: 'Axis Flipkart', issuing_bank: 'Axis Bank', credit_limit: 150000, owner: 'Sujata', last4: '9034', billing_day: 5, active: true },
    { id: 'cc-sbi', name: 'SBI SimplyCLICK', issuing_bank: 'SBI Card', credit_limit: 200000, owner: 'Joint', last4: '5567', billing_day: 25, active: true },
  ])
  const goals = T([
    { id: 'g-emerg', name: 'Emergency fund (6 months)', goal_type: 'emergency', target_amount: 270000, target_date: addMonthsISO(today, 10), expected_return: 6.5, inflation_pct: 0, step_up_pct: 0, manual_amount: 40000, priority: 1, active: true },
    { id: 'g-house', name: 'Home down payment', goal_type: 'house', target_amount: 1800000, target_date: addMonthsISO(today, 60), expected_return: 11, inflation_pct: 6, step_up_pct: 0, manual_amount: 0, priority: 2, active: true },
    { id: 'g-edu', name: "Child's education", goal_type: 'education', target_amount: 2500000, target_date: addMonthsISO(today, 144), expected_return: 12, inflation_pct: 6, step_up_pct: 10, manual_amount: 0, priority: 2, active: true },
    { id: 'g-trip', name: 'Europe trip', goal_type: 'travel', target_amount: 400000, target_date: addMonthsISO(today, 18), expected_return: 8, inflation_pct: 0, step_up_pct: 0, manual_amount: 0, priority: 3, active: true },
  ])

  // ---- holdings (baseline = start of the SIP history) ---------------------------------------------
  const base = dateInMonth(mAgo(5), 1)
  const baseline = addMonthsISO(base, 0)
  const priceDate = today
  const hold = (o) => ({ baseline_date: baseline, cost_known: true, source: 'manual', active: true, price_date: priceDate, ...o })
  const holdings = T([
    hold({ id: 'h-ppfc', name: 'Parag Parikh Flexi Cap Fund - Direct Growth', asset_type: 'mutual_fund', category: 'Flexi Cap', person: 'Lalit', units: 520.4, invested_amount: 41000, price: 84.6 }),
    hold({ id: 'h-nifty', name: 'UTI Nifty 50 Index Fund - Direct Growth', asset_type: 'mutual_fund', category: 'Index Fund - Large Cap', person: 'Lalit', units: 388.2, invested_amount: 58000, price: 172.9 }),
    hold({ id: 'h-small', name: 'Nippon India Small Cap Fund - Direct Growth', asset_type: 'mutual_fund', category: 'Small Cap', person: 'Sujata', units: 210.6, invested_amount: 30000, price: 176.4 }),
    hold({ id: 'h-bal', name: 'HDFC Balanced Advantage Fund - Direct Growth', asset_type: 'mutual_fund', category: 'Balanced Advantage', person: 'Sujata', units: 190.3, invested_amount: 84000, price: 528.1 }),
    hold({ id: 'h-liq', name: 'ICICI Prudential Liquid Fund - Direct Growth', asset_type: 'mutual_fund', category: 'Liquid', person: 'Joint', units: 310.9, invested_amount: 108000, price: 372.8 }),
    hold({ id: 'h-gold', name: 'Nippon India ETF Gold BeES', asset_type: 'etf', category: 'Gold Fund / ETF', person: 'Lalit', units: 300, invested_amount: 18000, price: 82.3, ticker: 'GOLDBEES.NS' }),
    hold({ id: 'h-infy', name: 'Infosys Ltd', asset_type: 'equity', category: null, person: 'Lalit', units: 25, invested_amount: 32000, price: 1540, ticker: 'INFY.NS' }),
    hold({ id: 'h-ppf', name: 'PPF - State Bank of India', asset_type: 'ppf', category: 'PPF', person: 'Lalit', units: null, invested_amount: 360000, current_value: 412000, price: null, price_date: null }),
    hold({ id: 'h-epf', name: 'EPF (Lalit)', asset_type: 'epf', category: 'EPF', person: 'Lalit', units: null, invested_amount: 520000, current_value: 655000, price: null, price_date: null }),
  ]).map((h) => ({ ...h, goal_id: null }))

  // ---- SIP master (start dates 5 months back so history fills automatically) ---------------------------
  const sipStart = (day) => dateInMonth(mAgo(5), day)
  const sip = (o) => ({ start_date: sipStart(o.sip_day), end_date: null, active: true, ...o })
  const sips = T([
    sip({ id: 's-ppfc', fund_name: 'Parag Parikh Flexi Cap Fund - Direct Growth', category: 'Flexi Cap', amount: 10000, sip_day: 5, person: 'Lalit', bank_account_id: 'bk-hdfc', goal_id: 'g-house', holding_id: 'h-ppfc' }),
    sip({ id: 's-nifty', fund_name: 'UTI Nifty 50 Index Fund - Direct Growth', category: 'Index Fund - Large Cap', amount: 5000, sip_day: 7, person: 'Lalit', bank_account_id: 'bk-hdfc', goal_id: 'g-edu', holding_id: 'h-nifty' }),
    sip({ id: 's-small', fund_name: 'Nippon India Small Cap Fund - Direct Growth', category: 'Small Cap', amount: 3000, sip_day: 10, person: 'Sujata', bank_account_id: 'bk-sbi', goal_id: 'g-edu', holding_id: 'h-small' }),
    sip({ id: 's-bal', fund_name: 'HDFC Balanced Advantage Fund - Direct Growth', category: 'Balanced Advantage', amount: 7000, sip_day: 12, person: 'Sujata', bank_account_id: 'bk-sbi', goal_id: 'g-house', holding_id: 'h-bal' }),
    sip({ id: 's-liq', fund_name: 'ICICI Prudential Liquid Fund - Direct Growth', category: 'Liquid', amount: 8000, sip_day: 1, person: 'Joint', bank_account_id: 'bk-icici', goal_id: 'g-emerg', holding_id: 'h-liq' }),
  ])
  // one lump-sum topped up last month
  const txns = T([{ id: 'tx-1', date: dateInMonth(mAgo(1), 18), holding_id: 'h-nifty', kind: 'additional', amount: 25000, units: null, nav: null, person: 'Lalit', bank_account_id: 'bk-hdfc', note: 'Bonus top-up' }])

  // ---- loans ----------------------------------------------------------------------------------------------
  const asOf = dateInMonth(mAgo(3), 1)
  const emi = (o) => ({ outstanding_as_of: asOf, active: true, tax_deductible: false, ...o })
  const emis = T([
    emi({ id: 'l-home', name: 'Home loan - HDFC', lender: 'HDFC Bank', loan_type: 'Home Loan', person: 'Joint', principal: 4200000, interest_rate: 8.65, tenure_months: 240, emi_amount: Math.round(pmt(4200000, 8.65, 240)), outstanding_amount: 3985000, emi_day: 5, bank_account_id: 'bk-hdfc', tax_deductible: true }),
    emi({ id: 'l-car', name: 'Car loan - Axis', lender: 'Axis Bank', loan_type: 'Car Loan', person: 'Lalit', principal: 850000, interest_rate: 9.4, tenure_months: 60, emi_amount: Math.round(pmt(850000, 9.4, 60)), outstanding_amount: 520000, emi_day: 10, bank_account_id: 'bk-hdfc' }),
    emi({ id: 'l-pl', name: 'Personal loan - ICICI', lender: 'ICICI Bank', loan_type: 'Personal Loan', person: 'Sujata', principal: 300000, interest_rate: 13.5, tenure_months: 36, emi_amount: Math.round(pmt(300000, 13.5, 36)), outstanding_amount: 190000, emi_day: 15, bank_account_id: 'bk-sbi' }),
  ])
  const prepay = T([{ id: 'pp-1', emi_id: 'l-pl', date: dateInMonth(mAgo(1), 20), amount: 20000, bank_account_id: 'bk-sbi', note: 'Diwali bonus' }])

  // ---- income ----------------------------------------------------------------------------------------------
  const income = []
  for (let k = 5; k >= 0; k--) {
    const m = mAgo(k)
    const d = dateInMonth(m, 1)
    if (d <= today) {
      income.push({ id: id('in'), date: d, person: 'Lalit', source: 'Salary', amount: 185000, bank_account_id: 'bk-hdfc' })
      income.push({ id: id('in'), date: d, person: 'Sujata', source: 'Salary', amount: 96000, bank_account_id: 'bk-sbi' })
    }
    if (k === 2) income.push({ id: id('in'), date: dateInMonth(m, 20), person: 'Lalit', source: 'Freelance', amount: 35000, bank_account_id: 'bk-hdfc' })
    if (k === 1) income.push({ id: id('in'), date: dateInMonth(m, 18), person: 'Lalit', source: 'Bonus', amount: 60000, bank_account_id: 'bk-hdfc' })
  }

  // ---- expenses ----------------------------------------------------------------------------------------------
  const expenses = []
  const add = (date, person, category, note, amount, pm, ref) => {
    if (date > today) return
    expenses.push({ id: id('ex'), date, person, category, note, amount, payment_method: pm, bank_account_id: pm === 'bank_upi' ? ref : null, credit_card_id: pm === 'credit_card' ? ref : null })
  }
  for (let k = 5; k >= 0; k--) {
    const m = mAgo(k)
    const D = (d) => dateInMonth(m, d)
    add(D(3), 'Lalit', 'Housing', 'Rent / maintenance', 12500, 'bank_upi', 'bk-hdfc')
    add(D(6), 'Lalit', 'Utilities', 'Electricity', rnd(1800, 3400), 'credit_card', 'cc-regalia')
    add(D(8), 'Sujata', 'Utilities', 'Broadband + mobile', 1698, 'credit_card', 'cc-flip')
    add(D(9), 'Lalit', 'Subscriptions', 'OTT + cloud', 1298, 'credit_card', 'cc-regalia')
    add(D(11), 'Sujata', 'Insurance', 'Health premium', 3200, 'bank_upi', 'bk-sbi')
    for (let w = 0; w < 4; w++) {
      add(D(2 + w * 7), 'Sujata', 'Groceries', 'Weekly groceries', round50(rnd(1800, 3600)), r() > 0.4 ? 'bank_upi' : 'credit_card', r() > 0.4 ? 'bk-icici' : 'cc-flip')
      add(D(4 + w * 7), 'Lalit', 'Fuel', 'Petrol', round50(rnd(1500, 2600)), 'fuel_card')
      add(D(1 + w * 7), 'Lalit', 'Dining', 'Office lunches', round50(rnd(700, 1600)), 'meal_card')
    }
    add(D(14), 'Sujata', 'Dining', 'Family dinner', round50(rnd(1800, 4200)), 'credit_card', 'cc-regalia')
    add(D(16), 'Lalit', 'Transport', 'Cabs / metro', round50(rnd(900, 2100)), 'bank_upi', 'bk-hdfc')
    add(D(19), 'Sujata', 'Shopping', 'Clothes & home', round50(rnd(2500, 9000)), 'credit_card', 'cc-flip')
    add(D(21), 'Lalit', 'Entertainment', 'Movies / games', round50(rnd(600, 1800)), 'credit_card', 'cc-sbi')
    add(D(22), 'Lalit', 'Utilities', 'Mobile recharge', 599, 'telecom_card')
    add(D(24), 'Sujata', 'Healthcare', 'Pharmacy / clinic', round50(rnd(400, 2400)), 'bank_upi', 'bk-sbi')
    if (k % 2 === 0) add(D(26), 'Sujata', 'Personal Care', 'Salon & spa', round50(rnd(1200, 2800)), 'credit_card', 'cc-flip')
    if (k === 3) add(D(27), 'Lalit', 'Travel', 'Weekend trip', 18500, 'credit_card', 'cc-regalia')
    if (k === 1) add(D(25), 'Sujata', 'Gifts & Donations', 'Wedding gift', 7000, 'bank_upi', 'bk-icici')
  }

  // ---- portfolio history (snapshots) --------------------------------------------------------------------------
  const snaps = []
  let v = 1120000
  for (let k = 11; k >= 1; k--) {
    v = Math.round(v * (1 + (r() - 0.4) * 0.04) + 42000)
    snaps.push({ id: id('sn'), date: dateInMonth(mAgo(k), 28), total_value: v, invested: Math.round(v * 0.86), by_class: {}, by_person: {} })
  }

  return {
    household: { id: HH, name: 'Demo household', members: ['Lalit', 'Sujata'], invite_code: 'DEMO0000', settings: {} },
    me: 'Lalit',
    tables: {
      bank_accounts: banks, credit_cards: cards, goals, holdings, sip_master: sips, sip_installments: [], investment_txns: txns,
      portfolio_snapshots: T(snaps), emi_master: emis, emi_payments: [], emi_prepayments: prepay,
      income: T(income), expenses: T(expenses),
    },
  }
}
