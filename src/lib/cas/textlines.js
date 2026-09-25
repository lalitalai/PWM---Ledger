// Turn pdf.js text items into visual lines. Pure function (no pdf.js import) so it is testable.
//
// CDSL/NSDL statements are bilingual: every English label has a Hindi twin drawn on top of it
// (and sometimes the value is drawn twice). We drop any non-ASCII item (the Hindi text has no
// usable unicode mapping anyway) and any item that sits on top of one we already kept.

const isPlain = (s) => !/[^\x20-\x7E₹]/.test(s)

/**
 * @param items pdf.js TextItem[] ({ str, transform: [a,b,c,d,x,y], width })
 * @returns lines top-to-bottom: { y, x, text, tokens: [{ x, w, str }] }
 */
export function itemsToLines(items, { yTol = 2.6 } = {}) {
  const toks = []
  items.forEach((it, idx) => {
    if (it.str === undefined) return
    const str = String(it.str)
    if (str.trim() === '' || !isPlain(str)) return
    toks.push({ x: it.transform[4], y: it.transform[5], w: it.width || 0, str, idx })
  })
  toks.sort((a, b) => b.y - a.y || a.x - b.x || a.idx - b.idx)

  const lines = []
  for (const t of toks) {
    const line = lines.find((l) => Math.abs(l.y - t.y) <= yTol)
    if (!line) { lines.push({ y: t.y, tokens: [t] }); continue }
    const dup = line.tokens.some((k) => {
      const ov = Math.min(k.x + k.w, t.x + t.w) - Math.max(k.x, t.x)
      return ov > 0.6 * Math.min(k.w || 1, t.w || 1)
    })
    if (!dup) line.tokens.push(t)
  }
  for (const l of lines) {
    l.tokens.sort((a, b) => a.x - b.x)
    let text = ''
    let prevEnd = null
    for (const t of l.tokens) {
      if (prevEnd != null) {
        const gap = t.x - prevEnd
        text += gap > 7 ? '  ' : gap > 0.4 ? ' ' : ''
      }
      text += t.str.trim()
      prevEnd = t.x + t.w
    }
    l.text = text.trim()
    l.x = l.tokens[0].x
  }
  return lines.filter((l) => l.text).sort((a, b) => b.y - a.y)
}
