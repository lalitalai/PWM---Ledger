export const PAYMENT_METHODS = [
  { id: 'bank_upi', label: 'Bank Transfer / UPI', short: 'Bank/UPI' },
  { id: 'credit_card', label: 'Credit Card', short: 'Credit Card' },
  { id: 'meal_card', label: 'Meal Card', short: 'Meal Card' },
  { id: 'fuel_card', label: 'Fuel Card', short: 'Fuel Card' },
  { id: 'telecom_card', label: 'Telecom Card', short: 'Telecom Card' },
]
export const paymentLabel = (id) => PAYMENT_METHODS.find((p) => p.id === id)?.short || id

// A "card" in the masters list is one of these kinds. Credit cards carry a limit and can be
// settled (paid off); meal/fuel/telecom cards are usually employer-loaded and just track spend.
export const CARD_KINDS = [
  { id: 'credit', label: 'Credit Card' },
  { id: 'meal', label: 'Meal Card' },
  { id: 'fuel', label: 'Fuel Card' },
  { id: 'telecom', label: 'Telecom Card' },
]
export const cardKindLabel = (id) => CARD_KINDS.find((k) => k.id === id)?.label || id
/** Which card kind a "paid with" method draws from. */
export const PAYMENT_CARD_KIND = { credit_card: 'credit', meal_card: 'meal', fuel_card: 'fuel', telecom_card: 'telecom' }
export const isCardPayment = (method) => method in PAYMENT_CARD_KIND

export const EMI_KINDS = [
  { id: 'loan', label: 'Loan (bank / lender)' },
  { id: 'card_emi', label: 'Credit card EMI' },
]
export const emiKindLabel = (id) => EMI_KINDS.find((k) => k.id === id)?.label || id

export const EXPENSE_CATEGORIES = [
  'Housing', 'Groceries', 'Utilities', 'Transport', 'Fuel', 'Dining', 'Healthcare', 'Shopping',
  'Travel', 'Insurance', 'Education', 'Entertainment', 'Subscriptions', 'Personal Care', 'Gifts & Donations',
  'Credit Card Payment', 'Other',
]

// Whether a purchase was made through an app/website or in person, and common vendors for each -
// always editable; these are just suggestions offered in a datalist.
export const EXPENSE_CHANNELS = [
  { id: 'online', label: 'Online / app' },
  { id: 'physical', label: 'Physical / in-person' },
]
export const channelLabel = (id) => EXPENSE_CHANNELS.find((c) => c.id === id)?.label || id
export const VENDOR_SUGGESTIONS = {
  online: ['Zepto', 'Blinkit', 'Swiggy', 'Zomato', 'District', 'Kisan Connect', 'Amazon', 'Flipkart', 'Myntra', 'Other'],
  physical: ['Office canteen', 'Dine out - friends', 'Dine out - family', 'Market purchase', 'Local store', 'Other'],
}

export const INCOME_SOURCES = ['Salary', 'Bonus', 'Freelance', 'Business', 'Rent', 'Interest', 'Dividend', 'Capital Gains', 'Refund', 'Gift', 'Other']

export const ASSET_TYPES = [
  { id: 'mutual_fund', label: 'Mutual Fund', unitBased: true },
  { id: 'equity', label: 'Stock', unitBased: true },
  { id: 'etf', label: 'ETF', unitBased: true },
  { id: 'gold', label: 'Gold (physical / SGB)', unitBased: true },
  { id: 'ppf', label: 'PPF', unitBased: false },
  { id: 'epf', label: 'EPF / VPF', unitBased: false },
  { id: 'nps', label: 'NPS', unitBased: false },
  { id: 'fd', label: 'FD / RD', unitBased: false },
  { id: 'real_estate', label: 'Real Estate', unitBased: false },
  { id: 'other', label: 'Other', unitBased: false },
]
export const assetLabel = (id) => ASSET_TYPES.find((a) => a.id === id)?.label || id
export const isUnitBased = (id) => !!ASSET_TYPES.find((a) => a.id === id)?.unitBased

// Asset class used for allocation + goal suggestions
export const ASSET_CLASS = { equity_fund: 'Equity', debt_fund: 'Debt', hybrid: 'Hybrid', gold: 'Gold', other: 'Other' }

export const FUND_CATEGORIES = [
  'Large Cap', 'Large & Mid Cap', 'Mid Cap', 'Small Cap', 'Flexi Cap', 'Multi Cap', 'Focused', 'Value / Contra', 'ELSS (Tax Saver)',
  'Index Fund - Large Cap', 'Index Fund - Mid/Small', 'Sectoral / Thematic', 'International',
  'Aggressive Hybrid', 'Balanced Advantage', 'Multi Asset', 'Arbitrage', 'Equity Savings',
  'Liquid', 'Ultra Short Duration', 'Short Duration', 'Corporate Bond', 'Banking & PSU Debt', 'Gilt', 'Gold Fund / ETF', 'Other',
]

/** Map a free-text category to Equity / Debt / Hybrid / Gold for allocation charts. */
export function assetClassOf(h) {
  const t = h.asset_type
  if (t === 'gold') return 'Gold'
  if (t === 'equity') return 'Equity'
  if (['ppf', 'epf', 'fd'].includes(t)) return 'Debt'
  if (t === 'nps') return 'Hybrid'
  if (t === 'real_estate' || t === 'other') return 'Other'
  const c = (h.category || h.name || '').toLowerCase()
  if (/gold/.test(c)) return 'Gold'
  if (/liquid|overnight|ultra|short dur|corporate bond|banking|psu|gilt|money market|debt|bond|floater|fmp/.test(c)) return 'Debt'
  if (/hybrid|balanced|multi.?asset|arbitrage|equity savings|dynamic asset/.test(c)) return 'Hybrid'
  return 'Equity'
}

export const LOAN_TYPES = ['Home Loan', 'Car Loan', 'Personal Loan', 'Education Loan', 'Two-wheeler Loan', 'Gold Loan', 'Consumer Durable / BNPL', 'Loan against Property/Securities', 'Other']

export const GOAL_TYPES = [
  { id: 'emergency', label: 'Emergency fund' },
  { id: 'house', label: 'Home / down payment' },
  { id: 'vehicle', label: 'Vehicle' },
  { id: 'education', label: "Child's education" },
  { id: 'wedding', label: 'Wedding' },
  { id: 'travel', label: 'Travel / vacation' },
  { id: 'retirement', label: 'Retirement' },
  { id: 'other', label: 'Other' },
]
export const goalTypeLabel = (id) => GOAL_TYPES.find((g) => g.id === id)?.label || id

export const BANK_ACCOUNT_TYPES = ['Savings', 'Salary', 'Current', 'Joint Savings', 'Other']
