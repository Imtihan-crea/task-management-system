// Cek tata letak mobile (375x812), baca-saja: screenshot tiap halaman + deteksi overflow horizontal.
// Hasil: SHOT_DIR (bawaan ~/.cache/taskmgmt-smoke/fase3/mobile) + mobile-result.json di OUT_DIR.
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'
import { guard, serviceClient, loadPlaywright, loginAdmin, runCleanup, appPages, BASE, writeOut } from './lib.mjs'

const SHOT_DIR = process.env.SHOT_DIR ?? path.join(os.homedir(), '.cache/taskmgmt-smoke/fase3/mobile')
fs.mkdirSync(SHOT_DIR, { recursive: true })
await guard()
const db = serviceClient()
const browser = await loadPlaywright().chromium.launch({ headless: true })
const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } })
const page = await ctx.newPage()
const results = []

async function check(p) {
  await page.goto(BASE + p, { waitUntil: 'networkidle', timeout: 45000 })
  const r = await page.evaluate(() => {
    const W = window.innerWidth
    const clipped = (el) => {
      for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
        const ox = getComputedStyle(a).overflowX
        if (ox === 'auto' || ox === 'scroll' || ox === 'hidden') return true
      }
      return false
    }
    const wide = []
    for (const el of document.querySelectorAll('body *')) {
      const b = el.getBoundingClientRect()
      if (b.width && b.right > W + 1 && !clipped(el) && getComputedStyle(el).position !== 'fixed') {
        wide.push(`${el.tagName.toLowerCase()}.${String(el.className).split(' ').slice(0, 3).join('.')} (${Math.round(b.right)}px)`)
      }
    }
    return { scrollWidth: document.documentElement.scrollWidth, W, wide: wide.slice(0, 5) }
  })
  const file = (p === '/login' ? 'login' : p.replace(/[0-9a-f-]{36}/g, 'ID').replace(/[^a-z0-9]+/gi, '_')).replace(/^_/, '') + '.png'
  await page.screenshot({ path: path.join(SHOT_DIR, file), fullPage: true })
  results.push({ path: p, overflow: r.scrollWidth > r.W, scrollWidth: r.scrollWidth, wide: r.wide, file })
}

try {
  await check('/login')
  await loginAdmin(db, page)
  for (const p of await appPages(page)) await check(p)
} finally {
  await browser.close()
  await runCleanup(db)
}
writeOut('mobile-result.json', results)
const bad = results.filter((r) => r.overflow || r.wide.length)
console.log(`halaman: ${results.length}, overflow: ${bad.length}`)
for (const r of bad) console.log(`  ${r.path} scrollWidth=${r.scrollWidth} ${r.wide.join(' | ')}`)
