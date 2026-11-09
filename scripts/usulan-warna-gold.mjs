/**
 * Membuat perbandingan visual kandidat warna deep-gold (docs/img/usulan-warna-gold/).
 * Tidak mengubah warna aplikasi. Jalankan: node scripts/usulan-warna-gold.mjs
 * Rumus kontras: WCAG 2.x (luminans relatif sRGB).
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { REPO, loadPlaywright } from './e2e/lib.mjs'

const lin = (c) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const lum = (h) => { const n = parseInt(h.slice(1), 16); return 0.2126 * lin(n >> 16) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255) }
export const rasio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }

const kandidat = [
  ['Sekarang', '#9C7C3F'], ['A (minimal)', '#8A6D35'], ['B', '#82652F'], ['C (paling gelap)', '#7A5F2B'],
]
for (const [n, h] of kandidat) console.log(`${n.padEnd(18)} ${h}  vs putih ${rasio(h, '#FFFFFF').toFixed(2)}  vs #F1F2F2 ${rasio(h, '#F1F2F2').toFixed(2)}`)

const baris = kandidat.map(([n, h]) => `
<section><h2>${n} <code>${h}</code> <span class="r">${rasio(h, '#FFFFFF').toFixed(2)}:1 ${rasio(h, '#FFFFFF') >= 4.5 ? 'LULUS' : 'GAGAL'}</span></h2>
<p class="b">Role dan status diatur oleh administrator. Ubah nama di <a style="color:${h}" class="s">Profil Saya</a>.</p>
<p class="b">Belum ada meeting. <a style="color:${h}" class="s">+ Buat Meeting</a></p></section>`).join('')
const html = `<!doctype html><meta charset=utf-8><style>
body{font:14px system-ui,sans-serif;background:#fff;margin:0;padding:16px;width:560px;color:#171717}
section{border:1px solid #e4e4e7;border-radius:8px;padding:10px 14px;margin-bottom:10px}
h2{font-size:13px;margin:0 0 6px}.r{float:right;font-weight:600}.b{color:#52525b;margin:4px 0}.s{font-weight:600;text-decoration:underline}
</style>${baris}`

const dir = path.join(REPO, 'docs/img/usulan-warna-gold')
fs.mkdirSync(dir, { recursive: true })
const tmp = path.join(os.homedir(), '.cache', 'taskmgmt-smoke', 'usulan-warna-gold.html')
fs.writeFileSync(tmp, html)
const browser = await loadPlaywright().chromium.launch()
const page = await browser.newPage({ viewport: { width: 592, height: 480 }, deviceScaleFactor: 2 })
await page.goto('file://' + tmp)
await page.screenshot({ path: path.join(dir, 'perbandingan.png'), fullPage: true })
await browser.close()
