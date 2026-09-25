// Indian-style money formatting.
export function inr(n, { sign = false } = {}) {
  const v = Math.round(Number(n) || 0)
  const s = '₹' + Math.abs(v).toLocaleString('en-IN')
  if (v < 0) return '-' + s
  return sign && v > 0 ? '+' + s : s
}
export function inrDecimal(n) {
  return '₹' + (Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
/** ₹1.2 Cr / ₹4.5 L / ₹32.1 K — for tight spaces and chart axes. */
export function inrCompact(n) {
  const v = Number(n) || 0
  const a = Math.abs(v)
  const s = v < 0 ? '-' : ''
  if (a >= 1e7) return `${s}₹${trim(a / 1e7)} Cr`
  if (a >= 1e5) return `${s}₹${trim(a / 1e5)} L`
  if (a >= 1e3) return `${s}₹${trim(a / 1e3)} K`
  return `${s}₹${Math.round(a)}`
}
const trim = (x) => (x >= 100 ? Math.round(x) : x >= 10 ? x.toFixed(1) : x.toFixed(2)).toString().replace(/\.?0+$/, '')
export const pct = (n, d = 1) => `${(Number(n) || 0).toFixed(d)}%`
export const num = (n, d = 0) => (Number(n) || 0).toLocaleString('en-IN', { maximumFractionDigits: d })
export const units = (n) => (Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 3 })
export function monthsToYM(m) {
  const y = Math.floor(m / 12), r = m % 12
  if (!y) return `${r} mo`
  return r ? `${y}y ${r}m` : `${y}y`
}
