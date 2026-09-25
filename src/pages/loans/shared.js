// Loans as the optimiser sees them: balances as of today, straight from the replay engine.
export function optimiserLoans(derived) {
  return derived.activeLoans
    .filter((l) => l.summary.balanceToday > 0.5 && !l.summary.neverCloses)
    .map((l) => ({ id: l.loan.id, name: l.loan.name, balance: l.summary.balanceToday, rate: Number(l.loan.interest_rate), emi: Number(l.loan.emi_amount), taxDeductible: !!l.loan.tax_deductible }))
}
export const TONE_ORDER = { avalanche: 'Avalanche', snowball: 'Snowball', tax: 'Tax-aware' }
