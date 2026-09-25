import { DEFAULT_ASSUMPTIONS } from './avenues.js'
export const DEFAULT_SETTINGS = { taxRelief: 25, surplusMonths: 3, assumptions: DEFAULT_ASSUMPTIONS }
export function mergeSettings(raw = {}) {
  return { ...DEFAULT_SETTINGS, ...raw, assumptions: { ...DEFAULT_ASSUMPTIONS, ...(raw.assumptions || {}) } }
}
