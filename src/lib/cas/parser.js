// CAS (Consolidated Account Statement) parser - CDSL layout (verified against a real statement),
// with generic ISIN-based rules that also cope with NSDL-style tables.
//
// Input : pages -> [{ lines: [{ y, x, text, tokens:[{x,w,str}] }] }]   (see textlines.js)
// Output: holdings ready to review + import, SIP candidates, and reconciliation checks against
//         the totals printed in the statement. PAN, e-mail, phone, nominee and address are never
//         read or returned.
import { inferFundCategory } from './categorize.js'

const NUM = /^-?[\d,]*\.?\d+$/
const isNumTok = (s) => NUM.test(s) || s === '--'
const toNum = (s) => Number(String(s).replace(/,/g, ''))
const ISIN_RE = /\b(IN[EF][0-9A-Z]{9})\b/
const DATE_DMY = /(\d{2})-(\d{2})-(\d{4})/
const iso = (d) => { const m = DATE_DMY.exec(d); return m ? `${m[3]}-${m[2]}-${m[1]}` : null }

const HEADER_WORDS = new Set(['a)', 'b)', 'bal', 'in', 'locked', 'pledge', 'pledged', 'remat', 'transit', 'confirmed', 'demat', 'frozen', 'setup', 'current',
  'market', 'price', '/', 'face', 'value', 'free', 'pending', 'isin', 'security', 'value(`)', 'value(₹)'])

/** Text tokens of a row that sit in the name column: after the ISIN column and before the first number. */
function leadingNameTokens(tokens, minX = 80) {
  const out = []
  for (const t of tokens) {
    const s = t.str.trim()
    if (t.x < minX) continue
    if (isNumTok(s)) break
    out.push(s)
  }
  return out
}

/** Assign every fragment to the nearest anchor (ISIN line) by vertical distance. */
function assignFragments(anchors, fragments) {
  const out = anchors.map((a) => ({ anchor: a, parts: [{ y: a.y, text: a.inline || '' }] }))
  for (const f of fragments) {
    let best = 0, bd = Infinity
    anchors.forEach((a, i) => { const d = Math.abs(a.y - f.y); if (d < bd) { bd = d; best = i } })
    if (out[best]) out[best].parts.push(f)
  }
  return out.map((o) => ({
    anchor: o.anchor,
    name: o.parts.filter((p) => p.text).sort((a, b) => b.y - a.y).map((p) => p.text).join(' ').replace(/\s+/g, ' ').trim(),
  }))
}

/** Strip RTA scheme code prefix ("02T - HDFC ...") and "#" markers used by depositories. */
function cleanName(raw) {
  let code = ''
  let name = raw
  const m = /^([A-Z0-9]{1,8})\s-\s(.+)$/.exec(raw)
  if (m) { code = m[1]; name = m[2] }
  name = name.replace(/\s*#\s*/g, ' ').replace(/\s+/g, ' ').trim()
  // demat: "XYZ LIMITED EQUITY SHARES OF RS. 2/- AFTER SPLIT" -> "XYZ LIMITED"
  name = name.replace(/\s*-?\s*(NEW\s+)?EQUITY SHARES.*$/i, '')
  // demat ETF: "AMC LTD#AMC MF-AMC NIFTY ETF" -> "AMC NIFTY ETF"
  if (/\bMF\s*-\s*/i.test(name)) name = name.replace(/^.*?\bMF\s*-\s*/i, '')
  return { code, name: name.trim() }
}

export function parseCas(pages) {
  const res = {
    ok: false, depository: null, statementDate: null, periodFrom: null, periodTo: null,
    mfHoldings: [], demat: [], transactions: [], sipCandidates: [], checks: [], warnings: [],
  }
  let section = null            // 'demat_hold' | 'mf_hold' | 'mf_txn'
  let depository = null
  let dp = null                 // { name, ref }
  let demat = { anchors: [], fragments: [] }
  let mf = { anchors: [], fragments: [] }
  let pageJoint = null
  let mfStated = null
  let txnIsin = null
  let txnName = null
  const dematStated = []
  const pending = []            // finalised demat groups (need dp context)
  let grand = null

  const flushDemat = () => {
    if (!demat.anchors.length) { demat = { anchors: [], fragments: [] }; return }
    const named = assignFragments(demat.anchors, demat.fragments)
    for (const { anchor: a, name } of named) {
      const cn = cleanName(name)
      const expected = a.units * a.price
      const consistent = Math.abs(expected - a.value) <= Math.max(1, a.value * 0.005)
      const units = consistent ? a.units : Math.round((a.value / a.price) * 1000) / 1000
      if (!consistent) res.warnings.push(`${cn.name || a.isin}: units x price does not match value - units recomputed from value`)
      const isFund = a.isin.startsWith('INF')
      const isEtf = isFund && /\betf\b|bees|exchange traded/i.test(cn.name)
      res.demat.push({
        source: 'demat', depository, dp_name: dp?.name || '', dp_ref: dp?.ref || '',
        asset_type: isFund ? (isEtf ? 'etf' : 'mutual_fund') : 'equity',
        isin: a.isin, name: cn.name || a.isin, units, price: a.price, value: a.value,
        invested: null, cost_known: false,
        category: isFund ? inferFundCategory(cn.name) : null,
        joint_with: a.joint || null,
      })
    }
    demat = { anchors: [], fragments: [] }
  }

  const flushMf = () => {
    if (!mf.anchors.length) return
    const named = assignFragments(mf.anchors, mf.fragments)
    for (const { anchor: a, name } of named) {
      const cn = cleanName(name)
      res.mfHoldings.push({
        source: 'mf', asset_type: 'mutual_fund', isin: a.isin, folio_no: a.folio, rta_code: cn.code, name: cn.name || a.isin,
        units: a.units, price: a.nav, invested: a.invested, value: a.value, cost_known: true,
        category: inferFundCategory(cn.name), joint_with: a.joint || null,
      })
    }
    mf = { anchors: [], fragments: [] }
  }

  pages.forEach((page) => {
    const lines = page.lines
    // Joint holder banner (top of the page only; the same words appear deeper in the account-details pages)
    pageJoint = null
    for (const l of lines) {
      if (l.y < 640) break
      const m = /^Joint A\/C Holder:\s*(\S.*)$/.exec(l.text)
      if (m) pageJoint = m[1].trim()
    }
    if (section === 'mf_hold' && !pageJoint && mf.joint) mf.joint = null

    for (let i = 0; i < lines.length; i++) {
      const l = lines[i]
      const t = l.text

      // ---- section markers ----
      let m
      if ((m = /DEMAT ACCOUNTS HELD WITH (CDSL|NSDL)/i.exec(t))) { flushDemat(); depository = m[1].toUpperCase(); res.depository = res.depository || depository; section = null; continue }
      if ((m = /^DP Name\s*:\s*(.+?)\s{2,}(?:BO ID|DPID)\s*:\s*(\S+)/i.exec(t))) {
        flushDemat()
        dp = { name: m[1].trim(), ref: m[2].slice(-4) }
        section = null
        continue
      }
      if ((m = /HOLDING STATEMENT AS ON\s+(\d{2}-\d{2}-\d{4})/i.exec(t))) {
        section = 'demat_hold'
        res.statementDate = res.statementDate || iso(m[1])
        continue
      }
      if ((m = /Portfolio Value\s*[`₹]?\s*([\d,]+\.?\d*)\s+as on/i.exec(t)) && section === 'demat_hold') {
        flushDemat()
        dematStated.push({ dp: dp?.name, value: toNum(m[1]) })
        section = null
        continue
      }
      if (/MUTUAL FUND UNITS HELD WITH MF\/RTA/i.test(t)) { flushDemat(); section = 'mf_txn'; continue }
      if ((m = /MUTUAL FUND UNITS HELD AS ON\s+(\d{2}-\d{2}-\d{4})/i.exec(t))) {
        flushDemat(); flushMf()
        section = 'mf_hold'; mf.joint = pageJoint
        res.statementDate = res.statementDate || iso(m[1])
        continue
      }
      if ((m = /Statement for the period from\s+(\d{2}-\w{3}-\d{4})\s+to\s+(\d{2}-\w{3}-\d{4})/i.exec(t))) {
        res.periodFrom = m[1]; res.periodTo = m[2]; continue
      }
      if (section === 'mf_hold' && /^Grand Total/i.test(t)) {
        const nums = t.split(/\s+/).filter((x) => NUM.test(x)).map(toNum)
        if (nums.length) mfStated = (mfStated || 0) + nums[nums.length - 1]
        flushMf(); section = null; continue
      }
      if (/^Load Structures/i.test(t)) { flushMf(); if (section === 'mf_hold') section = null; continue }

      // ---- demat holdings rows ----
      if (section === 'demat_hold') {
        const isinTok = l.tokens.find((k) => k.x < 70 && /^IN[EF][0-9A-Z]{9}$/.test(k.str.trim()))
        if (isinTok && !l.tokens.some((k) => k.str.trim() === 'ISIN')) {
          const rest = l.tokens.filter((k) => k !== isinTok)
          const nums = rest.filter((k) => isNumTok(k.str.trim()) && k.x > 150).map((k) => k.str.trim()).filter((s) => s !== '--')
          if (nums.length >= 3) {
            const [units, price, value] = nums.slice(-3).map(toNum)
            const inline = leadingNameTokens(rest).join(' ')
            demat.anchors.push({ y: l.y, isin: isinTok.str.trim(), units, price, value, inline, joint: pageJoint })
          } else res.warnings.push(`Could not read the numbers for ${isinTok.str.trim()}`)
        } else {
          const first = l.tokens[0]
          const isHeader = l.tokens.some((k) => k.str.trim() === 'ISIN')
          if (!isHeader && l.y < 655 && first && first.x >= 85 && first.x <= 130 && !HEADER_WORDS.has(first.str.trim().toLowerCase())) {
            const nt = leadingNameTokens(l.tokens)
            if (nt.length) demat.fragments.push({ y: l.y, text: nt.join(' ') })
          }
        }
        continue
      }

      // ---- mutual fund holdings table ----
      if (section === 'mf_hold') {
        const rowRe = /(INF[0-9A-Z]{9})\s+(\S+)\s+(-?[\d,]*\.?\d+)\s+(-?[\d,]*\.?\d+)\s+(-?[\d,]*\.?\d+)\s+(-?[\d,]*\.?\d+)\s+(-?[\d,]*\.?\d+)\s+(-?[\d,]*\.?\d+)\s*$/
        const r = rowRe.exec(t)
        if (r) {
          const inline = t.slice(0, r.index).trim()
          mf.anchors.push({
            y: l.y, isin: r[1], folio: r[2], units: toNum(r[3]), nav: toNum(r[4]), invested: toNum(r[5]), value: toNum(r[6]), inline,
            joint: pageJoint,
          })
        } else if (l.x < 30 && l.y < 655 && !/^(Scheme Name|Grand Total|Notes)/i.test(t)) {
          mf.fragments.push({ y: l.y, text: t })
        }
        continue
      }

      // ---- mutual fund transactions ----
      if (section === 'mf_txn') {
        let mm
        if ((mm = /^ISIN\s*:\s*(INF[0-9A-Z]{9})/.exec(t))) {
          txnIsin = mm[1]
          const prev = lines[i - 1]
          const nm = prev ? /^([A-Z0-9]{1,8})\s-\s(.+)$/.exec(prev.text) : null
          txnName = nm ? nm[2].trim() : ''
          continue
        }
        const dl = /^(\d{2}-\d{2}-\d{4})\s*(.*?)\s*((?:-?[\d,]*\.?\d+\s+){6}-?[\d,]*\.?\d+)\s*$/.exec(t)
        if (dl && txnIsin) {
          const nums = dl[3].trim().split(/\s+/).map(toNum)
          const [amount, nav, price, units, stamp] = nums
          // description may wrap above / below the date line
          const desc = [dl[2]]
          const prev = lines[i - 1]
          if (prev && prev.x > 60 && !/Opening Balance|Closing Balance|STT|Total Tax/i.test(prev.text) && !/^\d{2}-\d{2}-\d{4}/.test(prev.text) && !/Duty|ution|awal/.test(prev.text)) desc.unshift(prev.text)
          for (let k = i + 1; k < lines.length && k <= i + 3; k++) {
            const nx = lines[k].text
            if (/^(STT|Total Tax|Closing Balance|Opening Balance)/i.test(nx) || /^\d{2}-\d{2}-\d{4}/.test(nx) || lines[k].x < 60) break
            desc.push(nx)
          }
          const description = desc.join(' ').replace(/\s+/g, ' ').trim()
          res.transactions.push({ date: iso(dl[1]), isin: txnIsin, name: txnName, description, amount, nav, price, units, stamp_duty: stamp })
        }
        continue
      }
    }
    // a table continues over pages, but anchors from this page must not be matched against next page's fragments
    if (section === 'demat_hold') flushDemat()
    if (section === 'mf_hold') flushMf()
  })
  flushDemat(); flushMf()

  // ---- SIP candidates from transactions ----
  const sips = new Map()
  const folioByIsin = new Map(res.mfHoldings.map((h) => [h.isin, h.folio_no]))
  for (const tx of res.transactions) {
    const isSip = /\bSIP\b|systematic|instal(l)?ment/i.test(tx.description)
    if (isSip && tx.units > 0 && tx.amount > 0) {
      const gross = Math.round((tx.amount + (tx.stamp_duty || 0)) * 100) / 100
      const prev = sips.get(tx.isin)
      if (!prev || tx.date > prev.last_date) {
        sips.set(tx.isin, { isin: tx.isin, name: tx.name, folio_no: folioByIsin.get(tx.isin) || null, amount: Math.round(gross), sip_day: Number(tx.date.slice(8, 10)), last_date: tx.date })
      }
    }
  }
  res.sipCandidates = [...sips.values()]

  // ---- reconciliation with the printed totals ----
  const mfSum = res.mfHoldings.reduce((s, h) => s + h.value, 0)
  if (mfStated != null) res.checks.push({ label: 'Mutual fund folios total', expected: mfStated, actual: mfSum, ok: Math.abs(mfStated - mfSum) < 1 })
  for (const s of dematStated) {
    const actual = res.demat.filter((d) => d.dp_name === s.dp).reduce((t, d) => t + d.value, 0)
    if (s.value > 0) res.checks.push({ label: `Demat - ${s.dp}`, expected: s.value, actual, ok: Math.abs(s.value - actual) < 1 })
  }
  res.ok = res.mfHoldings.length + res.demat.length > 0
  if (!res.ok) res.warnings.push('No holdings were found. Is this a CDSL/NSDL Consolidated Account Statement (CAS) PDF?')
  return res
}

/** Flat list of what would be imported, with a stable key for upsert. */
export function casToHoldingRows(parsed) {
  const rows = []
  for (const h of parsed.mfHoldings) rows.push({ ...h, key: `mf|${h.isin}|${h.folio_no}` })
  for (const d of parsed.demat) rows.push({ ...d, key: `dm|${d.isin}|${d.dp_name}|${d.dp_ref}` })
  return rows
}
