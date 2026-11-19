// Screenshot semua halaman di 4 ukuran (iPhone 390, Android 412, Windows 1366, Mac 1440) + deteksi overflow.
// Baca-saja (user admin uji dibuat & dihapus). Hasil: OUT (bawaan ~/.cache/taskmgmt-smoke/shots) + result.json.
// Opsional: VIEWS=iphone,windows (ukuran tertentu), PAGES=/dashboard,/tasks (path persis, tanpa query = semua tab-nya),
// DARK=1 (mode gelap).
import path from 'node:path'
import fs from 'node:fs'
import { guard, serviceClient, loadPlaywright, loginAdmin, makeAdminDeveloper, runCleanup, appPages, BASE, OUT_DIR } from './lib.mjs'
const OUT = process.env.OUT ?? path.join(OUT_DIR, 'shots')
const VIEWS = [
  { name: 'iphone', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' },
  { name: 'android', viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  { name: 'windows', viewport: { width: 1366, height: 768 } },
  { name: 'mac', viewport: { width: 1440, height: 900 } },
]
const onlyViews = process.env.VIEWS?.split(',')
const onlyPages = process.env.PAGES?.split(',')
await guard()
const db = serviceClient()
const browser = await loadPlaywright().chromium.launch({ headless: true })
const results = []
try {
  await makeAdminDeveloper(db)
  let pages = null
  for (const v of VIEWS.filter((x) => !onlyViews || onlyViews.includes(x.name))) {
    fs.mkdirSync(path.join(OUT, v.name), { recursive: true })
    const { name, ...opts } = v
    const ctx = await browser.newContext({ ...opts, colorScheme: process.env.DARK ? 'dark' : 'light' })
    const page = await ctx.newPage()
    await loginAdmin(db, page)
    pages ??= (await appPages(page)).filter((p) => !onlyPages || onlyPages.includes(p.split('?')[0].replace(/[0-9a-f-]{36}/g, 'ID')))
    for (const p of pages) {
      try {
        await page.goto(BASE + p, { waitUntil: 'networkidle', timeout: 45000 })
        const r = await page.evaluate(() => ({
          sw: document.documentElement.scrollWidth,
          W: window.innerWidth,
          h: document.documentElement.scrollHeight,
          // Target sentuh < 44px (kecuali tautan di dalam kalimat, dikecualikan WCAG 2.5.8).
          small: [...document.querySelectorAll('a[href],button,select,input:not([type=hidden]),summary')]
            .filter((el) => {
              const b = el.getBoundingClientRect()
              if (!b.width || !b.height || getComputedStyle(el).visibility === 'hidden') return false
              if (el.tagName === 'A' && getComputedStyle(el).display === 'inline' && el.parentElement?.closest('p,li,td')) return false
              const lbl = el.matches('[type=checkbox],[type=radio]') ? el.closest('label') ?? (el.id ? document.querySelector(`label[for="${el.id}"]`) : null) : null
              if (lbl && lbl.getBoundingClientRect().height >= 44) return false
              return b.height < 44 || b.width < 24
            })
            .map((el) => `${el.tagName.toLowerCase()}:${(el.textContent || el.getAttribute('aria-label') || el.getAttribute('name') || '').trim().slice(0, 30)}:${Math.round(el.getBoundingClientRect().height)}`),
        }))
        const file = p.replace(/[0-9a-f-]{36}/g, 'ID').replace(/[^a-z0-9]+/gi, '_').replace(/^_/, '') + '.png'
        await page.screenshot({ path: path.join(OUT, name, file), fullPage: true })
        results.push({ view: name, path: p, overflow: r.sw > r.W, sw: r.sw, h: r.h, small: r.small, file })
      } catch (e) { results.push({ view: name, path: p, error: String(e).slice(0, 120) }) }
    }
    await ctx.close()
  }
} finally {
  await browser.close()
  await runCleanup(db)
}
fs.writeFileSync(path.join(OUT, 'result.json'), JSON.stringify(results, null, 1))
console.log('total', results.length, 'overflow', results.filter((r) => r.overflow).map((r) => `${r.view}:${r.path}`).join(' '), 'error', results.filter((r) => r.error).length)
