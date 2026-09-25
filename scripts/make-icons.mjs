// Renders the PWA / Android icons from SVG. Run:  npm run icons
import sharp from 'sharp'
import fs from 'node:fs'

const bars = (pad) => `
  <g transform="translate(${pad} ${pad}) scale(${(512 - pad * 2) / 512})">
    <g fill="#C79A3B"><rect x="118" y="290" width="70" height="104" rx="12"/><rect x="221" y="220" width="70" height="174" rx="12"/><rect x="324" y="132" width="70" height="262" rx="12"/></g>
    <rect x="100" y="410" width="312" height="10" rx="5" fill="#E9DBB8" opacity=".55"/><circle cx="393" cy="118" r="20" fill="#7DBB93"/>
  </g>`
const svg = (rx, pad) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="${rx}" fill="#1E2A33"/>${bars(pad)}</svg>`

const out = 'public/icons'
fs.mkdirSync(out, { recursive: true })
const jobs = [
  ['icon-192.png', 192, svg(112, 0)],
  ['icon-512.png', 512, svg(112, 0)],
  ['icon-maskable-512.png', 512, svg(0, 96)],       // full-bleed, content inside the 80% safe zone
  ['apple-touch-icon.png', 180, svg(0, 40)],
]
for (const [file, size, s] of jobs) await sharp(Buffer.from(s)).resize(size, size).png().toFile(`${out}/${file}`)
console.log('icons written to', out)
