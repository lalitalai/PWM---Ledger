import { DEFAULT_ASSUMPTIONS } from './avenues.js'
// transferAliases: extra spellings of the household members' own names as banks print them
// ("suj kothav", "Anil Alai"...) - a statement payment to one of these is a transfer, not spending.
export const DEFAULT_SETTINGS = { taxRelief: 25, surplusMonths: 3, assumptions: DEFAULT_ASSUMPTIONS, transferAliases: [] }
export function mergeSettings(raw = {}) {
  return { ...DEFAULT_SETTINGS, ...raw, assumptions: { ...DEFAULT_ASSUMPTIONS, ...(raw.assumptions || {}) } }
}
