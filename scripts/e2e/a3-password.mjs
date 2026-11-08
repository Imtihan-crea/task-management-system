// Uji audit A3: ganti password paksa tidak bisa dilewati. User uji
// uji-e2e-a3@example.com dibuat dengan must_change_password=true dan selalu
// dihapus di finally (runCleanup). Password tidak pernah dicetak.
import crypto from 'node:crypto'
import { guard, serviceClient, loadPlaywright, makeUser, loginPassword, runCleanup, BASE, EMAIL_LIKE } from './lib.mjs'

await guard()
const db = serviceClient()
const results = []
const check = (name, ok, info = '') => results.push({ name, ok: Boolean(ok), info })
const flag = async (id) => (await db.from('profiles').select('must_change_password').eq('id', id).single()).data?.must_change_password
const newPw = () => crypto.randomBytes(15).toString('base64url') + 'aB1'
const canLogin = async (email, password) => {
  const { createClient } = (await import('node:module')).createRequire(import.meta.url)('@supabase/supabase-js')
  const env = Object.fromEntries((await import('node:fs')).readFileSync('.env.local', 'utf8').split('\n').filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.split('=')[0], l.slice(l.indexOf('=') + 1).replace(/^["']|["']$/g, '')]))
  const c = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } })
  const { error } = await c.auth.signInWithPassword({ email, password })
  return !error
}

const browser = await loadPlaywright().chromium.launch({ headless: true })

try {
  const u = await makeUser(db, 'a3', 'TEAM_MEMBER', 'UJI-E2E A3')
  await db.from('profiles').update({ must_change_password: true }).eq('id', u.id)
  const page = await (await browser.newContext()).newPage()

  await loginPassword(page, u).catch(() => {})
  await page.waitForTimeout(1500)
  check('login mengarah ke /change-password', /change-password/.test(page.url()), page.url().replace(BASE, ''))

  // Password terlalu pendek: ditolak, flag tetap.
  await page.fill('#new_password', 'short'); await page.fill('#confirm_password', 'short')
  await page.click('button[type="submit"]'); await page.waitForTimeout(1500)
  check('password pendek ditolak, flag tetap', (await flag(u.id)) === true && /change-password/.test(page.url()))

  // Password sama dengan password sementara: ditolak, flag tetap.
  await page.fill('#new_password', u.password); await page.fill('#confirm_password', u.password)
  await page.click('button[type="submit"]'); await page.waitForTimeout(2500)
  check('password sama dengan lama ditolak, flag tetap', (await flag(u.id)) === true && /change-password/.test(page.url()) && /berbeda/.test(await page.locator('[role="alert"]').allInnerTexts().then((a) => a.join(' '))))

  const pw2 = newPw()
  await page.fill('#new_password', pw2); await page.fill('#confirm_password', pw2)
  await page.click('button[type="submit"]')
  await page.waitForURL(/dashboard/, { timeout: 30000 }).catch(() => {})
  check('sukses -> /dashboard', /dashboard/.test(page.url()), page.url().replace(BASE, ''))
  check('flag bersih setelah ganti', (await flag(u.id)) === false)
  check('password lama tidak berlaku', !(await canLogin(u.email, u.password)))
  check('password baru berlaku', await canLogin(u.email, pw2))

  // Recovery link -> /reset-password.
  const { data: link } = await db.auth.admin.generateLink({ type: 'recovery', email: u.email })
  await db.from('profiles').update({ must_change_password: true }).eq('id', u.id)
  const p2 = await (await browser.newContext()).newPage()
  await p2.goto(`${BASE}/reset-password#token_hash=${link.properties.hashed_token}&type=recovery`, { waitUntil: 'networkidle' })
  await p2.locator('input[type="password"]').first().waitFor({ timeout: 30000 })
  const pw3 = newPw()
  await p2.fill('#password', pw3); await p2.fill('#confirm', pw3)
  await p2.click('button[type="submit"]')
  await p2.waitForURL(/dashboard/, { timeout: 30000 }).catch(() => {})
  check('reset-password sukses -> /dashboard', /dashboard/.test(p2.url()), p2.url().replace(BASE, ''))
  check('reset: flag bersih', (await flag(u.id)) === false)
  check('reset: password baru berlaku', await canLogin(u.email, pw3))
  check('reset: password sebelumnya tidak berlaku', !(await canLogin(u.email, pw2)))
} catch (e) {
  check('EXC', false, e.message)
} finally {
  await browser.close()
  await runCleanup(db)
  const { count } = await db.from('profiles').select('id', { count: 'exact', head: true }).like('email', EMAIL_LIKE)
  check('sisa user uji = 0', count === 0, String(count))
}
for (const r of results) console.log(`${r.ok ? 'LULUS' : 'GAGAL'}  ${r.name}${r.info ? ' (' + r.info + ')' : ''}`)
process.exit(results.every((r) => r.ok) ? 0 : 1)
