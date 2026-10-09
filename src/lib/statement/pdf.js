// Read a Paytm / GPay / bank statement PDF in the browser (nothing is uploaded anywhere).
import { itemsToLines } from '../cas/textlines.js'
import { detectAndParse } from './detect.js'

let libPromise
async function loadPdfjs() {
  if (!libPromise) {
    libPromise = (async () => {
      const lib = await import('pdfjs-dist')
      const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
      lib.GlobalWorkerOptions.workerSrc = worker.default
      return lib
    })()
  }
  return libPromise
}

export class PasswordNeeded extends Error {
  constructor(wrong) { super(wrong ? 'Incorrect password' : 'This PDF is password protected'); this.wrong = wrong }
}

/** @param file File | ArrayBuffer   @param password optional - bank statements are often locked with your PAN / account number / DOB */
export async function readStatementPdf(file, password, lib) {
  const pdfjs = lib || (await loadPdfjs())
  const buf = file.arrayBuffer ? await file.arrayBuffer() : file
  const task = pdfjs.getDocument({ data: new Uint8Array(buf), password, useSystemFonts: true })
  let doc
  try { doc = await task.promise } catch (e) {
    if (e?.name === 'PasswordException') throw new PasswordNeeded(e.code === 2)
    throw e
  }
  const pages = []
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p)
    const tc = await page.getTextContent()
    pages.push({ lines: itemsToLines(tc.items) })
  }
  const { rows, source, reason } = detectAndParse(pages)
  // First-page text, for working out which of your accounts the statement belongs to (account no.)
  const headerText = (pages[0]?.lines || []).map((l) => l.text).join('\n')
  return { rows, pageCount: doc.numPages, source, reason, headerText }
}
