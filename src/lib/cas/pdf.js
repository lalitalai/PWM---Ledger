// Read a CAS PDF in the browser (nothing is uploaded anywhere) and parse it.
import { itemsToLines } from './textlines.js'
import { parseCas } from './parser.js'

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

/** @param file File | ArrayBuffer   @param password optional - CAS PDFs are usually protected with your PAN (uppercase) */
export async function readCasPdf(file, password, lib) {
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
  return parseCas(pages)
}
