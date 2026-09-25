export const TABLES = [
  'bank_accounts', 'credit_cards', 'goals', 'holdings', 'sip_master', 'sip_installments', 'investment_txns',
  'portfolio_snapshots', 'emi_master', 'emi_payments', 'emi_prepayments', 'income', 'expenses',
]
export const emptyData = () => Object.fromEntries(TABLES.map((t) => [t, []]))
