// Uji Daily Tracker + Master Reference (HR Tahap 1, 16 Nov 2026): isi dari daftar
// dan teks bebas, proyek internal, saran jam mulai, tolak bentrok/lewat tengah malam,
// ubah, hapus, akses rekap (hr.view) dan Master Reference (reference.manage), aturan
// label hanya-menambah, arsip, dan kukuhkan usulan teks bebas.
// Semua data berawalan "UJI-E2E"; work_logs ikut terhapus bersama user uji,
// pilihan master uji dihapus di akhir (aplikasi sendiri tidak punya hapus).
import { guard, serviceClient, loadPlaywright, loginPassword, makeUser, runCleanup, writeOut, day, BASE, PREFIX as P } from './lib.mjs'

await guard()
const db = serviceClient()
const results = []
const check = (name, ok, info = '') => results.push({ name, ok: Boolean(ok), info: String(info).slice(0, 200) })
const logs = async (uid) =>
  (await db.from('work_logs').select('id, start_time, duration_minutes, activity, project_id, project_name, internal_project_ref, category, category_ref, location_ref').eq('user_id', uid).order('start_time')).data ?? []
const ref = async (label) => (await db.from('master_references').select('id, code, label, archived_at').ilike('label', label).maybeSingle()).data
const until = async (fn, ms = 10000) => {
  for (let t = 0; t < ms; t += 250) { if (await fn()) return true; await new Promise((r) => setTimeout(r, 250)) }
  return false
}
const alertWith = (page, text) => page.getByRole('alert').filter({ hasText: text }).first().waitFor({ timeout: 10000 }).then(() => true, () => false)
const today = day(0)
const FREE_CAT = `${P} Kategori Bebas`
const LOC = `${P} Lokasi Uji`

const browser = await loadPlaywright().chromium.launch({ headless: true })
let cleanupResult
const userIds = []
try {
  const member = await makeUser(db, 'tracker', 'TEAM_MEMBER', `${P} Karyawan Tracker`)
  const admin = await makeUser(db, 'admin3', 'ADMIN', `${P} Admin Tanpa HR`)
  const dev = await makeUser(db, 'dev2', 'ADMIN', `${P} Developer HR`)
  await db.from('profiles').update({ is_developer: true }).eq('id', dev.id)
  userIds.push(member.id, admin.id, dev.id)
  const { data: proj, error: pe } = await db.from('projects').insert({ name: `${P} Proyek Tracker`, status: 'ACTIVE', start_date: day(-5), end_date: day(30) }).select('id').single()
  if (pe) throw new Error('project: ' + pe.message)

  const mctx = await browser.newContext()
  const page = await mctx.newPage()
  page.on('dialog', (d) => d.accept())
  await loginPassword(page, member)
  // Regresi lonceng (16 Nov 2026): angka belum dibaca tampil tanpa membuka, popover memuat isi (dulu "Memuat..." terus).
  await db.from('notifications').insert({ user_id: member.id, type: 'TRACKER_REMINDER', title: `${P} Pengingat uji`, message: 'Catat aktivitas hari ini.', entity_type: 'tracker', entity_id: today })
  await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' })
  const bell = page.locator('button[aria-label="Notifications"]').first()
  check('lonceng: angka belum dibaca tampil', await bell.getByText('1', { exact: true }).waitFor({ timeout: 10000 }).then(() => true, () => false))
  await bell.click()
  check('lonceng: popover memuat notifikasi', await page.getByRole('dialog', { name: 'Notifications' }).getByText(`${P} Pengingat uji`).waitFor({ timeout: 10000 }).then(() => true, () => false))
  await page.getByRole('dialog', { name: 'Notifications' }).getByText(`${P} Pengingat uji`).click()
  check('lonceng: klik membuka Daily Tracker hari itu', await page.waitForURL(new RegExp(`/tracker\\?tanggal=${today}`), { timeout: 10000 }).then(() => true, () => false), page.url())
  await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' })
  check('menu Daily Tracker tampil untuk anggota tim', (await page.getByRole('link', { name: 'Daily Tracker' }).count()) >= 1)
  check('menu Master Reference tidak tampil untuk anggota tim', (await page.getByRole('link', { name: 'Master Reference' }).count()) === 0)

  const fill = async ({ start, end, activity, project = `${P} Proyek Tracker`, category = 'Focus Work', location = 'WFA', output = 'Hasil uji' }) => {
    await page.goto(`${BASE}/tracker?tanggal=${today}`, { waitUntil: 'networkidle' })
    await page.fill('#project', project)
    if (start) await page.fill('#start_time', start)
    await page.fill('#end_time', end)
    await page.fill('#category', category)
    await page.fill('#location', location)
    await page.fill('#activity', activity)
    await page.fill('#output', output)
    await page.getByRole('button', { name: 'Catat aktivitas' }).click()
  }

  // 1. Entri dari daftar: project TMS + kategori/lokasi master
  await fill({ start: '08:00', end: '10:00', activity: `${P} Aktivitas 1` })
  check('isi: tersimpan 120 menit', await until(async () => (await logs(member.id))[0]?.duration_minutes === 120))
  check('isi: pesan sukses tampil', await page.getByRole('status').filter({ hasText: 'Aktivitas dicatat' }).waitFor({ timeout: 10000 }).then(() => true, () => false))
  check('isi: saran jam mulai terbarui tanpa muat ulang', await until(async () => (await page.inputValue('#start_time')) === '10:00'), await page.inputValue('#start_time'))
  const a = (await logs(member.id))[0]
  check('isi: tertaut project TMS + kategori + lokasi master', a && a.project_id === proj.id && a.category_ref && a.location_ref, JSON.stringify(a))

  // 2. Saran jam mulai; proyek internal (beda huruf) + kategori teks bebas + output kosong
  await page.goto(`${BASE}/tracker?tanggal=${today}`, { waitUntil: 'networkidle' })
  check('saran jam mulai 10:00', (await page.inputValue('#start_time')) === '10:00', await page.inputValue('#start_time'))
  await fill({ end: '11:30', activity: `${P} Aktivitas 2`, project: 'manajemen perusahaan', category: FREE_CAT, output: '' })
  check('pesan usulan teks bebas', await page.getByRole('status').filter({ hasText: 'usulan' }).waitFor({ timeout: 10000 }).then(() => true, () => false))
  const b = (await logs(member.id))[1]
  check('proyek internal tertaut, nama dari master', b && b.internal_project_ref && b.project_name === 'Manajemen Perusahaan' && !b.project_id, JSON.stringify(b))
  check('kategori teks bebas tersimpan apa adanya', b && b.category === FREE_CAT && b.category_ref === null, JSON.stringify(b))
  await page.goto(`${BASE}/tracker?tanggal=${today}`, { waitUntil: 'networkidle' })
  check('daftar menandai teks bebas', (await page.getByText('(teks bebas)').count()) === 1)
  check('output kosong ditandai di daftar', (await page.getByText('Kosong', { exact: true }).count()) === 1)

  // 3. Bentrok & lewat tengah malam ditolak
  await fill({ start: '09:00', end: '09:30', activity: `${P} Bentrok` })
  check('bentrok ditolak', await alertWith(page, 'bentrok'))
  await fill({ start: '22:00', end: '01:00', activity: `${P} Malam` })
  check('lewat tengah malam ditolak', await alertWith(page, 'tengah malam'))
  check('isian tidak hilang saat ditolak', (await page.inputValue('#activity')) === `${P} Malam`)
  check('tidak ada entri tambahan', (await logs(member.id)).length === 2)

  // 4. Ringkasan jam hari ini 3,5
  await page.goto(`${BASE}/tracker?tanggal=${today}`, { waitUntil: 'networkidle' })
  check('ringkasan hari ini 3,5 / 8', (await page.getByText('3,5 / 8').count()) >= 1)

  // 5. Ubah entri pertama
  await page.goto(`${BASE}/tracker?tanggal=${today}&ubah=${a.id}`, { waitUntil: 'networkidle' })
  check('ubah: isian proyek terisi nama project', (await page.inputValue('#project')) === `${P} Proyek Tracker`)
  await page.fill('#activity', `${P} Aktivitas 1 diubah`)
  await page.fill('#start_time', '07:30')
  await page.getByRole('button', { name: 'Simpan perubahan' }).click()
  check('ubah: tersimpan', await until(async () => { const l = (await logs(member.id))[0]; return l?.activity === `${P} Aktivitas 1 diubah` && l.duration_minutes === 150 }))
  check('ubah: kembali ke mode isi baru', await page.waitForURL((u) => !u.searchParams.has('ubah'), { timeout: 10000 }).then(() => true, () => false))

  // 6. Hapus (entri ketiga)
  await fill({ start: '12:00', end: '12:30', activity: `${P} Dihapus` })
  await until(async () => (await logs(member.id)).length === 3)
  await page.goto(`${BASE}/tracker?tanggal=${today}`, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'Hapus' }).last().click()
  check('hapus: tinggal 2 entri', await until(async () => (await logs(member.id)).length === 2))

  // 7. Tanggal masa depan di URL jatuh ke hari ini
  await page.goto(`${BASE}/tracker?tanggal=${day(3)}`, { waitUntil: 'networkidle' })
  check('tanggal masa depan di URL jatuh ke hari ini', (await page.inputValue('#work_date')) === today)

  // 8. Anggota tim: rekap & Master Reference ditolak
  await page.goto(`${BASE}/tracker/rekap`, { waitUntil: 'networkidle' })
  check('anggota tim: rekap ditolak', /dashboard/.test(page.url()))
  await page.goto(`${BASE}/master-reference`, { waitUntil: 'networkidle' })
  check('anggota tim: Master Reference ditolak', /dashboard/.test(page.url()))

  // 9. Admin biasa: tanpa izin ditolak; setelah diberi bisa
  {
    const c = await browser.newContext()
    const p = await c.newPage()
    await loginPassword(p, admin)
    await p.goto(`${BASE}/tracker/rekap`, { waitUntil: 'networkidle' })
    check('admin tanpa hr.view: rekap ditolak', /dashboard/.test(p.url()))
    await p.goto(`${BASE}/master-reference`, { waitUntil: 'networkidle' })
    check('admin tanpa reference.manage: Master Reference ditolak', /dashboard/.test(p.url()))
    await db.from('user_permissions').insert([
      { user_id: admin.id, permission: 'hr.view', project_id: null, granted: true },
      { user_id: admin.id, permission: 'reference.manage', project_id: null, granted: true },
    ])
    await p.goto(`${BASE}/tracker/rekap`, { waitUntil: 'networkidle' })
    check('admin diberi hr.view: rekap terbuka', (await p.getByRole('heading', { name: 'Rekap Daily Tracker' }).count()) === 1)
    await p.goto(`${BASE}/master-reference`, { waitUntil: 'networkidle' })
    check('admin diberi reference.manage: Master Reference terbuka', (await p.getByRole('heading', { name: 'Master Reference' }).count()) === 1)
    await c.close()
  }

  // 10. Developer: rekap + Master Reference
  const dctx = await browser.newContext()
  const dp = await dctx.newPage()
  dp.on('dialog', (d) => d.accept())
  await loginPassword(dp, dev)
  await dp.goto(`${BASE}/tracker/rekap?bulan=${today.slice(0, 7)}`, { waitUntil: 'networkidle' })
  const row = dp.getByRole('row').filter({ hasText: `${P} Karyawan Tracker` })
  check('rekap: baris karyawan 4 jam', (await row.getByRole('cell', { name: '4', exact: true }).count()) >= 1, await row.innerText().catch(() => ''))
  await row.getByRole('link').click()
  check('rekap: rincian proyek internal', await dp.getByRole('cell', { name: 'Manajemen Perusahaan', exact: true }).first().waitFor({ timeout: 10000 }).then(() => true, () => false))
  check('rekap: kategori teks bebas ditandai', (await dp.getByRole('cell', { name: `${FREE_CAT} (teks bebas)` }).count()) >= 1)

  await dp.goto(`${BASE}/master-reference`, { waitUntil: 'networkidle' })
  // Tambah pilihan
  await dp.fill('#add-label-WORK_LOCATION', LOC)
  await dp.locator('#WORK_LOCATION').getByRole('button', { name: 'Tambah' }).click()
  check('tambah: tersimpan dengan kode dari label', await until(async () => (await ref(LOC))?.code === 'UJI_E2E_LOKASI_UJI'))
  await dp.fill('#add-label-ACTIVITY_CATEGORY', 'focus work')
  await dp.locator('#ACTIVITY_CATEGORY').getByRole('button', { name: 'Tambah' }).click()
  check('tambah: label kembar (beda huruf) ditolak', await alertWith(dp, 'sudah ada'))

  // Ubah: ganti total ditolak, menambah boleh, kode tetap
  const loc = await ref(LOC)
  await dp.goto(`${BASE}/master-reference`, { waitUntil: 'networkidle' })
  const locRow = dp.locator('#WORK_LOCATION tr', { hasText: LOC })
  await locRow.locator('summary').click()
  await dp.fill(`#edit-label-${loc.id}`, 'Lokasi Lain')
  await locRow.getByRole('button', { name: 'Simpan' }).click()
  check('ubah: ganti total ditolak', await alertWith(dp, 'hanya boleh ditambah'))
  await dp.fill(`#edit-label-${loc.id}`, `${LOC} Baru`)
  await dp.fill(`#edit-desc-${loc.id}`, 'Penjelasan uji')
  await locRow.getByRole('button', { name: 'Simpan' }).click()
  check('ubah: menambah label + penjelasan tersimpan, kode tetap', await until(async () => { const r = await ref(`${LOC} Baru`); return r?.code === 'UJI_E2E_LOKASI_UJI' }))

  // Arsip: pilihan arsip ditolak untuk isian baru
  await dp.goto(`${BASE}/master-reference`, { waitUntil: 'networkidle' })
  await dp.locator('#WORK_LOCATION tr', { hasText: `${LOC} Baru` }).getByRole('button', { name: 'Arsipkan' }).click()
  check('arsip: archived_at terisi', await until(async () => Boolean((await ref(`${LOC} Baru`))?.archived_at)))
  await fill({ start: '13:00', end: '13:30', activity: `${P} Pakai arsip`, location: `${LOC} Baru` })
  check('arsip: pilihan arsip ditolak di tracker', await alertWith(page, 'diarsipkan'))

  // Kukuhkan usulan teks bebas sebagai pilihan baru
  await dp.goto(`${BASE}/master-reference`, { waitUntil: 'networkidle' })
  const sug = dp.locator('#ACTIVITY_CATEGORY li', { hasText: FREE_CAT })
  check('usulan teks bebas tampil', (await sug.count()) === 1)
  await sug.getByRole('button', { name: 'Kukuhkan' }).click()
  check('kukuhkan: pilihan baru dibuat', await until(async () => Boolean(await ref(FREE_CAT))))
  const promoted = await ref(FREE_CAT)
  check('kukuhkan: entri tertaut, teks asli tetap', await until(async () => { const l = (await logs(member.id))[1]; return l?.category_ref === promoted?.id && l.category === FREE_CAT }))
  await dctx.close()
  await mctx.close()
} catch (e) {
  check('EXC', false, e.message.split('\n')[0])
} finally {
  await browser.close().catch(() => {})
  cleanupResult = await runCleanup(db)
}

// work_logs uji sudah terhapus bersama user; baru pilihan master uji bisa dihapus.
const left = userIds.length ? ((await db.from('work_logs').select('id').in('user_id', userIds)).data ?? []).length : 0
check('pembersihan: work_logs uji terhapus', left === 0, left)
const { data: refRows } = await db.from('master_references').select('id').like('label', `${P}%`)
const refIds = (refRows ?? []).map((r) => r.id)
if (refIds.length) {
  await db.from('activity_logs').delete().eq('entity_type', 'master_reference').in('entity_id', refIds)
  await db.from('master_references').delete().in('id', refIds)
}
check('pembersihan: pilihan master uji terhapus', ((await db.from('master_references').select('id').like('label', `${P}%`)).data ?? []).length === 0)
const ok = results.filter((r) => r.ok).length
for (const r of results) console.log(`${r.ok ? 'OK   ' : 'GAGAL'} ${r.name}${r.ok ? '' : ' :: ' + r.info}`)
console.log(`cek: ${ok}/${results.length} lulus`)
console.log('pembersihan: sisa:', JSON.stringify(cleanupResult?.left ?? cleanupResult))
writeOut('tracker-result.json', results)
process.exit(ok === results.length ? 0 : 1)
