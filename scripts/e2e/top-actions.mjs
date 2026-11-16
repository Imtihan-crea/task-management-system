// Uji tindakan petinggi (16 Nov 2026): set password, ganti email, hapus akun.
// Semua data berawalan "UJI-E2E"; server WAJIB tanpa BREVO (guard di lib.mjs).
// Developer uji (ADMIN + is_developer) melakukan ketiganya lewat klik di /users/[id];
// Admin uji biasa tidak melihat bagian "Tindakan Super Admin". Rahasia tidak dicetak.
import { guard, serviceClient, loadPlaywright, loginPassword, makeUser, runCleanup, writeOut, BASE, PREFIX as P } from './lib.mjs'

await guard()
const db = serviceClient()
const results = []
const check = (name, ok, info = '') => results.push({ name, ok: Boolean(ok), info: String(info).slice(0, 200) })
const profile = async (id) => (await db.from('profiles').select('email, status, deleted_at, must_change_password').eq('id', id).single()).data
const until = async (fn, ms = 10000) => {
  for (let t = 0; t < ms; t += 250) { if (await fn()) return true; await new Promise((r) => setTimeout(r, 250)) }
  return false
}

const browser = await loadPlaywright().chromium.launch({ headless: true })
let cleanupResult
try {
  const dev = await makeUser(db, 'dev', 'ADMIN', `${P} Developer`)
  await db.from('profiles').update({ is_developer: true }).eq('id', dev.id)
  const admin = await makeUser(db, 'admin2', 'ADMIN', `${P} Admin Biasa`)
  const target = await makeUser(db, 'target', 'TEAM_MEMBER', `${P} Target`)

  // Admin biasa: bagian petinggi tidak tampil.
  {
    const context = await browser.newContext()
    const page = await context.newPage()
    await loginPassword(page, admin)
    await page.goto(`${BASE}/users/${target.id}`, { waitUntil: 'networkidle' })
    check('admin biasa: tidak ada "Tindakan Super Admin"', (await page.getByText('Tindakan Super Admin').count()) === 0)
    check('admin biasa: tidak ada bagian Wewenang', (await page.getByRole('heading', { name: 'Wewenang' }).count()) === 0)
    await context.close()
  }

  const context = await browser.newContext()
  const page = await context.newPage()
  page.on('dialog', (d) => d.accept())
  await loginPassword(page, dev)
  await page.goto(`${BASE}/users/${target.id}`, { waitUntil: 'networkidle' })
  check('developer: bagian "Tindakan Super Admin" tampil', (await page.getByText('Tindakan Super Admin').count()) === 1)
  check('developer: bagian Wewenang tampil', (await page.getByRole('heading', { name: 'Wewenang' }).count()) === 1)

  // 1. Set password
  const newPw = `Uji-${Date.now()}`
  await page.fill('#top_password', newPw)
  await page.getByRole('button', { name: 'Set password', exact: true }).click()
  check('set password: wajib ganti di DB', await until(async () => (await profile(target.id))?.must_change_password === true))
  {
    const c2 = await browser.newContext()
    const p2 = await c2.newPage()
    await p2.goto(BASE + '/login', { waitUntil: 'networkidle' })
    await p2.fill('input[type="email"]', target.email)
    await p2.fill('input[type="password"]', newPw)
    await p2.click('button[type="submit"]')
    check('set password: login dengan password baru diarahkan ganti password', await p2.waitForURL(/change-password/, { timeout: 20000 }).then(() => true, () => false))
    await c2.close()
  }

  // 2. Ganti email
  const newEmail = 'uji-e2e-target2@example.com'
  await page.fill('#top_email', newEmail)
  await page.getByRole('button', { name: 'Ganti email', exact: true }).click()
  check('ganti email: profil berubah', await until(async () => (await profile(target.id))?.email === newEmail))
  const { data: authUser } = await db.auth.admin.getUserById(target.id)
  check('ganti email: email login berubah', authUser?.user?.email === newEmail)

  // 3. Wewenang: simpan satu aturan supaya terbukti ikut terhapus saat akun dihapus
  await page.reload({ waitUntil: 'networkidle' })
  await page.selectOption('#perm_users\\.view', 'grant')
  await page.getByRole('button', { name: 'Simpan wewenang', exact: true }).click()
  check('wewenang: aturan tersimpan', await until(async () => ((await db.from('user_permissions').select('id').eq('user_id', target.id)).data ?? []).length === 1))

  // 4. Hapus akun
  await page.getByRole('button', { name: 'Hapus akun', exact: true }).click()
  check('hapus: deleted_at + INACTIVE', await until(async () => { const p = await profile(target.id); return Boolean(p?.deleted_at) && p?.status === 'INACTIVE' }))
  const { data: banned } = await db.auth.admin.getUserById(target.id)
  check('hapus: login diblokir (banned_until)', Boolean(banned?.user?.banned_until))
  check('hapus: aturan wewenang ikut terhapus', ((await db.from('user_permissions').select('id').eq('user_id', target.id)).data ?? []).length === 0)
  await page.goto(`${BASE}/users`, { waitUntil: 'networkidle' })
  check('hapus: tidak tampil di daftar user', (await page.getByText(`${P} Target`).count()) === 0)
  await page.goto(`${BASE}/users/${target.id}`, { waitUntil: 'networkidle' })
  check('hapus: detail menulis akun dihapus', (await page.getByText('Akun dihapus pada').count()) === 1)
  {
    const c3 = await browser.newContext()
    const p3 = await c3.newPage()
    await p3.goto(BASE + '/login', { waitUntil: 'networkidle' })
    await p3.fill('input[type="email"]', newEmail)
    await p3.fill('input[type="password"]', newPw)
    await p3.click('button[type="submit"]')
    await p3.waitForTimeout(4000)
    check('hapus: akun tidak bisa login', !/dashboard|change-password/.test(p3.url()))
    await c3.close()
  }

  // Developer tidak bisa menghapus dirinya (tombol tidak ada).
  await page.goto(`${BASE}/users/${dev.id}`, { waitUntil: 'networkidle' })
  check('developer: tidak ada tombol hapus akun sendiri', (await page.getByRole('button', { name: 'Hapus akun', exact: true }).count()) === 0)
  await context.close()
} catch (e) {
  check('EXC', false, e.message.split('\n')[0])
} finally {
  await browser.close().catch(() => {})
  cleanupResult = await runCleanup(db)
}

const ok = results.filter((r) => r.ok).length
for (const r of results) console.log(`${r.ok ? 'OK   ' : 'GAGAL'} ${r.name}${r.ok ? '' : ' :: ' + r.info}`)
console.log(`cek: ${ok}/${results.length} lulus`)
console.log('pembersihan: sisa:', JSON.stringify(cleanupResult?.left ?? cleanupResult))
writeOut('top-actions-result.json', results)
process.exit(ok === results.length ? 0 : 1)
