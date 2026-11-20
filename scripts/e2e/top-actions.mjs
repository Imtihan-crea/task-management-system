// Uji tindakan petinggi (16 Nov 2026): set password, ganti email, hapus akun.
// 20 Nov 2026: keluarkan dari semua perangkat (tombol + otomatis saat set password), gabung akun.
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

  // 0. Celah 20 Nov 2026: perangkat yang sedang login harus keluar setelah dicabut.
  const victim = await browser.newContext()
  const vp = await victim.newPage()
  await loginPassword(vp, target)
  await page.getByRole('button', { name: 'Keluarkan dari semua perangkat', exact: true }).click()
  check('keluarkan: pesan sukses tampil', await page.getByRole('status').filter({ hasText: 'dikeluarkan dari' }).waitFor({ timeout: 10000 }).then(() => true, () => false))
  await vp.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' })
  check('keluarkan: perangkat lain kembali ke login', /\/login/.test(vp.url()), vp.url())
  await loginPassword(vp, target)
  check('keluarkan: pemilik bisa login lagi dengan password lama', /dashboard/.test(vp.url()))

  // 1. Set password
  const newPw = `Uji-${Date.now()}`
  await page.fill('#top_password', newPw)
  await page.getByRole('button', { name: 'Set password', exact: true }).click()
  check('set password: wajib ganti di DB', await until(async () => (await profile(target.id))?.must_change_password === true))
  await vp.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' })
  check('set password: perangkat yang masih login ikut keluar', /\/login/.test(vp.url()), vp.url())
  await victim.close()
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

  // 5. Gabung akun (20 Nov 2026): data sumber pindah, wewenang kembar tidak dobel, sumber hilang.
  {
    const lama = await makeUser(db, 'lama', 'TEAM_MEMBER', `${P} Orang Sama Lama`)
    const baru = await makeUser(db, 'baru', 'TEAM_MEMBER', `${P} Orang Sama Baru`)
    await db.from('profiles').update({ division: 'HR', tracker_required: true }).eq('id', lama.id)
    await db.from('notifications').insert([1, 2].map((i) => ({ user_id: lama.id, type: 'TRACKER_REMINDER', title: `${P} notif ${i}`, message: 'uji', entity_type: 'tracker', entity_id: 'x' })))
    await db.from('user_permissions').insert([
      { user_id: lama.id, permission: 'hr.view', project_id: null, granted: true },
      { user_id: baru.id, permission: 'hr.view', project_id: null, granted: true },
      { user_id: lama.id, permission: 'leave.approve', project_id: null, granted: true },
    ])
    await page.goto(`${BASE}/users/${lama.id}`, { waitUntil: 'networkidle' })
    await page.selectOption('#merge_target', baru.id)
    await page.getByRole('button', { name: 'Gabung akun', exact: true }).click()
    check('gabung: diarahkan ke akun tujuan', await page.waitForURL(new RegExp(`/users/${baru.id}`), { timeout: 15000 }).then(() => true, () => false), page.url())
    const notif = (await db.from('notifications').select('user_id').like('title', `${P} notif%`)).data ?? []
    check('gabung: notifikasi pindah ke akun tujuan', notif.length === 2 && notif.every((n) => n.user_id === baru.id), JSON.stringify(notif))
    const perms = ((await db.from('user_permissions').select('permission').eq('user_id', baru.id)).data ?? []).map((p) => p.permission).sort()
    check('gabung: wewenang digabung tanpa kembar', JSON.stringify(perms) === JSON.stringify(['hr.view', 'leave.approve']), JSON.stringify(perms))
    const dst = await db.from('profiles').select('division, tracker_required').eq('id', baru.id).single()
    check('gabung: data karyawan kosong diisi dari akun lama', dst.data?.division === 'HR' && dst.data?.tracker_required === true, JSON.stringify(dst.data))
    const src = await profile(lama.id)
    check('gabung: akun lama terhapus', Boolean(src?.deleted_at) && src?.status === 'INACTIVE')
    const { data: banned2 } = await db.auth.admin.getUserById(lama.id)
    check('gabung: akun lama tidak bisa login', Boolean(banned2?.user?.banned_until))
    await page.goto(`${BASE}/users`, { waitUntil: 'networkidle' })
    check('gabung: hanya satu akun tampil di daftar', (await page.getByText(`${P} Orang Sama Lama`).count()) === 0 && (await page.getByText(`${P} Orang Sama Baru`).count()) >= 1)
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
