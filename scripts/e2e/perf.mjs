// Ukur performa halaman (TTFB + muat penuh, 3 kali, median) sebagai admin uji.
// Baca-saja terhadap data nyata; hanya user UJI-E2E sementara yang dibuat lalu dihapus.
// Pakai: PERF_OUT=sebelum.json node scripts/e2e/perf.mjs
import { guard, serviceClient, loadPlaywright, loginAdmin, runCleanup, appPages, BASE, writeOut } from './lib.mjs'

await guard()
const db = serviceClient()
const browser = await loadPlaywright().chromium.launch({ headless: true })
const page = await browser.newPage()
const median = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)]
const rows = []
try {
  await loginAdmin(db, page)
  for (const p of await appPages(page)) {
    const ttfb = [], load = []
    for (let i = 0; i < 3; i++) {
      await page.goto(BASE + p, { waitUntil: 'load', timeout: 60000 })
      await page.waitForLoadState('networkidle').catch(() => {})
      const t = await page.evaluate(() => { const n = performance.getEntriesByType('navigation')[0]; return [n.responseStart - n.requestStart, n.loadEventEnd - n.startTime] })
      ttfb.push(Math.round(t[0])); load.push(Math.round(t[1]))
    }
    rows.push({ path: p, ttfb: median(ttfb), load: median(load) })
  }
} finally {
  await browser.close()
  console.log((await runCleanup(db)).lines.at(-1))
}
writeOut(process.env.PERF_OUT ?? 'perf-result.json', rows)
for (const r of [...rows].sort((a, b) => b.ttfb - a.ttfb)) console.log(`${String(r.ttfb).padStart(5)} ms TTFB  ${String(r.load).padStart(5)} ms load  ${r.path}`)
