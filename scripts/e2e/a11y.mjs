// Audit aksesibilitas baca-saja dengan axe-core: /login (tanpa login) + semua halaman admin.
// axe-core TIDAK ada di package.json. Pasang di folder lain: `npm install axe-core`, lalu set
// AXE_PATH ke axe.min.js-nya. Bawaan: ~/.cache/taskmgmt-smoke/fase3/axe/node_modules/axe-core/axe.min.js
// Hasil: ~/.cache/taskmgmt-smoke/a11y-result.json (nama berkas bisa diganti lewat A11Y_OUT).
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { guard, serviceClient, loadPlaywright, loginAdmin, appPages, BASE, writeOut } from './lib.mjs'

const AXE = process.env.AXE_PATH ?? path.join(os.homedir(), '.cache/taskmgmt-smoke/fase3/axe/node_modules/axe-core/axe.min.js')
if (!fs.existsSync(AXE)) { console.error('axe.min.js tidak ditemukan: ' + AXE + ' (set AXE_PATH)'); process.exit(2) }
const axeSource = fs.readFileSync(AXE, 'utf8')

await guard()
const db = serviceClient()
const browser = await loadPlaywright().chromium.launch({ headless: true })
const page = await browser.newPage()
const results = []

async function audit(p) {
  await page.goto(BASE + p, { waitUntil: 'networkidle', timeout: 45000 })
  await page.evaluate(axeSource)
  const r = await page.evaluate(() => axe.run(document, { resultTypes: ['violations'] }))
  results.push({
    path: p,
    violations: r.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, targets: v.nodes.slice(0, 4).map((n) => n.target.join(' ')) })),
  })
}

try {
  await audit('/login')
  await loginAdmin(db, page)
  for (const p of await appPages(page)) await audit(p)
} finally {
  await browser.close()
}

const byRule = {}
for (const r of results) for (const v of r.violations) {
  byRule[v.id] ??= { impact: v.impact, nodes: 0, pages: 0 }
  byRule[v.id].nodes += v.nodes
  byRule[v.id].pages += 1
}
writeOut(process.env.A11Y_OUT ?? 'a11y-result.json', { byRule, results })
console.log(`halaman: ${results.length}, total pelanggaran: ${Object.values(byRule).reduce((a, b) => a + b.nodes, 0)}`)
for (const [id, v] of Object.entries(byRule)) console.log(`  ${id} [${v.impact}] node=${v.nodes} halaman=${v.pages}`)
