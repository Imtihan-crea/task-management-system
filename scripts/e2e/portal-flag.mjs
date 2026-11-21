// Saklar Portal mati (NEXT_PUBLIC_PORTAL_ENABLED kosong): login -> /dashboard, /portal
// dialihkan, menu samping lengkap per kelompok, tanpa tombol/menu Portal.
import { guard, serviceClient, loadPlaywright, loginPassword, makeUser, runCleanup, BASE, PREFIX as P } from './lib.mjs'

await guard()
const db = serviceClient()
const results = []
const check = (n, ok, info = '') => results.push({ n, ok: Boolean(ok), info: String(info).slice(0, 160) })
const browser = await loadPlaywright().chromium.launch({ headless: true })
try {
  const pm = await makeUser(db, 'flag-pm', 'PROJECT_MANAGER', `${P} PM Flag`)
  const page = await (await browser.newContext()).newPage()
  await loginPassword(page, pm)
  check('login mendarat di /dashboard', page.url().endsWith('/dashboard'), page.url())
  await page.goto(`${BASE}/portal`, { waitUntil: 'networkidle' })
  check('/portal dialihkan ke /dashboard', page.url().endsWith('/dashboard'), page.url())
  const nav = page.getByRole('navigation', { name: 'Navigasi utama' }).first()
  const text = await nav.innerText()
  check('menu samping tanpa "Semua aplikasi"/"Portal"', !/Semua aplikasi|^Portal$/m.test(text), text.replace(/\n/g, ' | '))
  check('menu samping lengkap (Tasks, Meetings, Cuti tampil sekaligus)', /Tasks/.test(text) && /Meetings/.test(text) && /Cuti/.test(text), text.replace(/\n/g, ' | '))
  check('topbar tanpa tombol Portal', (await page.getByRole('link', { name: 'Portal, semua aplikasi' }).count()) === 0)
  check('logo menuju /dashboard', (await page.getByRole('link', { name: 'Kasuat, ke Dashboard' }).first().getAttribute('href')) === '/dashboard')
  await page.goto(`${BASE}/users`, { waitUntil: 'networkidle' })
  check('halaman tanpa izin -> /dashboard?denied=1', /\/dashboard\?denied=1/.test(page.url()), page.url())
} catch (e) {
  check('tanpa exception', false, e.stack ?? e)
} finally {
  await browser.close()
  const c = await runCleanup(db)
  check('data uji bersih', c.ok, JSON.stringify(c.left))
}
for (const r of results) console.log(`${r.ok ? 'OK   ' : 'GAGAL'} ${r.n}${r.ok ? '' : ' :: ' + r.info}`)
process.exit(results.every((r) => r.ok) ? 0 : 1)
