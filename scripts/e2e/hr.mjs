// Uji sisa HR Tahap 1 (16 Nov 2026): pengaturan HR (kalender, target dikunci),
// data karyawan di detail user, tab Daily Tracker project (PM View) + komentar +
// notifikasi, import histori Excel, dan saklar pengingat (mati).
// Data uji: user/project "UJI-E2E"; kalender & target memakai tahun 2099 lalu dihapus.
// Aturan jam (hr_settings) TIDAK diubah karena berlaku untuk semua orang.
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import fs from 'node:fs'
import { guard, serviceClient, loadEnv, loadPlaywright, loginPassword, makeUser, runCleanup, writeOut, day, BASE, OUT_DIR, PREFIX as P } from './lib.mjs'

await guard()
const db = serviceClient()
const results = []
const check = (name, ok, info = '') => results.push({ name, ok: Boolean(ok), info: String(info).slice(0, 200) })
const until = async (fn, ms = 10000) => {
  for (let t = 0; t < ms; t += 250) { if (await fn()) return true; await new Promise((r) => setTimeout(r, 250)) }
  return false
}
const seen = (loc) => loc.first().waitFor({ timeout: 10000 }).then(() => true, () => false)
const serial = (iso) => (Date.parse(`${iso}T00:00:00Z`) - Date.UTC(1899, 11, 30)) / 86400000
const today = day(0)
const HOLIDAY = '2099-01-05'

const browser = await loadPlaywright().chromium.launch({ headless: true })
let cleanupResult
const userIds = []
try {
  const member = await makeUser(db, 'hrmember', 'TEAM_MEMBER', `${P} Karyawan HR`)
  const other = await makeUser(db, 'hrother', 'TEAM_MEMBER', `${P} Rekan Lain`)
  const pm = await makeUser(db, 'hrpm', 'PROJECT_MANAGER', `${P} PM Tracker`)
  const dev = await makeUser(db, 'hrdev', 'ADMIN', `${P} Developer HR2`)
  await db.from('profiles').update({ is_developer: true }).eq('id', dev.id)
  userIds.push(member.id, other.id, pm.id, dev.id)
  const { data: proj, error: pe } = await db.from('projects').insert({ name: `${P} Proyek PM View`, status: 'ACTIVE', start_date: day(-5), end_date: day(30) }).select('id').single()
  if (pe) throw new Error('project: ' + pe.message)
  await db.rpc('set_project_managers', { p_project_id: proj.id, p_user_ids: [pm.id] })
  // Satu aktivitas member di project ini (lewat service; alur isi diuji di e2e:tracker).
  const { data: log, error: le } = await db.from('work_logs').insert({
    user_id: member.id, work_date: today, project_id: proj.id, project_name: `${P} Proyek PM View`,
    activity: `${P} Kerja project`, start_time: '08:00', end_time: '10:00', location: 'WFA', category: 'Meeting', output: 'Hasil',
  }).select('id').single()
  if (le) throw new Error('log: ' + le.message)

  // 1. PM: tab Daily Tracker di project + komentar
  {
    const c = await browser.newContext()
    const p = await c.newPage()
    await loginPassword(p, pm)
    await p.goto(`${BASE}/projects/${proj.id}?tab=tracker`, { waitUntil: 'networkidle' })
    check('PM: tab Daily Tracker tampil', (await p.locator('[aria-label="Workspace Project"] a', { hasText: 'Daily Tracker' }).count()) === 1)
    check('PM: aktivitas anggota tampil', await seen(p.getByText(`${P} Kerja project`)))
    await p.fill(`#comment-${log.id}`, 'Tolong lengkapi detail output.')
    await p.getByRole('button', { name: 'Kirim' }).click()
    check('PM: komentar tersimpan', await until(async () => ((await db.from('work_log_comments').select('id').eq('work_log_id', log.id)).data ?? []).length === 1))
    check('PM: notifikasi ke pemilik entri', await until(async () => ((await db.from('notifications').select('id').eq('user_id', member.id).eq('type', 'TRACKER_COMMENT')).data ?? []).length === 1))
    await p.goto(`${BASE}/master-reference`, { waitUntil: 'networkidle' })
    check('PM tanpa reference.manage: Master Reference ditolak', /dashboard/.test(p.url()))
    await c.close()
  }

  // 2. Anggota: melihat komentar di /tracker; rekan lain tidak melihat tab tracker project
  {
    const c = await browser.newContext()
    const p = await c.newPage()
    await loginPassword(p, member)
    await p.goto(`${BASE}/tracker?tanggal=${today}`, { waitUntil: 'networkidle' })
    check('anggota: komentar PM tampil di tracker', await seen(p.getByText('Tolong lengkapi detail output.')))
    await c.close()
  }
  {
    // Rekan lain punya task di project supaya halaman project terbuka, tetapi tanpa tracker.review.
    const { error: te } = await db.from('tasks').insert({
      code: `T-UJI-${Math.random().toString(36).slice(2, 8).toUpperCase()}`, title: `${P} Task rekan`, project_id: proj.id,
      assignee_id: other.id, created_by: pm.id, priority: 'MEDIUM', status: 'TODO', deadline: day(5),
    })
    if (te) throw new Error('task: ' + te.message)
    const c = await browser.newContext()
    const p = await c.newPage()
    await loginPassword(p, other)
    await p.goto(`${BASE}/projects/${proj.id}?tab=tracker`, { waitUntil: 'networkidle' })
    check('rekan tanpa izin: tab tracker tidak tampil', (await p.locator('[aria-label="Workspace Project"] a', { hasText: 'Daily Tracker' }).count()) === 0)
    check('rekan tanpa izin: aktivitas orang lain tidak tampil', (await p.getByText(`${P} Kerja project`).count()) === 0)
    await c.close()
  }

  // 3. Developer: pengaturan HR, data karyawan, import, rekap
  const c = await browser.newContext()
  const p = await c.newPage()
  p.on('dialog', (d) => d.accept())
  await loginPassword(p, dev)

  await p.goto(`${BASE}/settings/hr?tahun=2099`, { waitUntil: 'networkidle' })
  check('pengaturan HR terbuka', (await p.getByRole('heading', { name: 'Pengaturan HR' }).count()) === 1)
  const before = await p.getByRole('row', { name: /^Jan 2099/ }).innerText()
  await p.fill('#cal_day', HOLIDAY)
  await p.fill('#cal_name', `${P} Libur uji`)
  await p.getByRole('button', { name: 'Tambah' }).click()
  check('kalender: libur tersimpan', await until(async () => Boolean((await db.from('work_calendar').select('day').eq('day', HOLIDAY).maybeSingle()).data)))
  await p.goto(`${BASE}/settings/hr?tahun=2099`, { waitUntil: 'networkidle' })
  const after = await p.getByRole('row', { name: /^Jan 2099/ }).innerText()
  check('kalender: hari kerja Jan 2099 berkurang 1', /\t22\t/.test(before) && /\t21\t/.test(after), `${before} | ${after}`)
  await p.fill('#target_month', '2099-01')
  await p.fill('#target_hours', '150')
  await p.getByRole('button', { name: 'Simpan', exact: true }).click()
  check('target: dikunci 150', await until(async () => Number((await db.from('hr_month_targets').select('target_hours').eq('month', '2099-01-01').maybeSingle()).data?.target_hours) === 150))
  await seen(p.getByRole('status').filter({ hasText: 'dikunci' }))
  await p.goto(`${BASE}/settings/hr?tahun=2099`, { waitUntil: 'networkidle' })
  check('target: tampil "(dikunci)" di tabel', (await p.getByRole('row', { name: /^Jan 2099/ }).getByText('150 (dikunci)').count()) === 1)
  await p.fill('#target_month', '2099-01')
  await p.fill('#target_hours', '')
  await p.getByRole('button', { name: 'Simpan', exact: true }).click()
  check('target: kunci dilepas', await until(async () => !(await db.from('hr_month_targets').select('month').eq('month', '2099-01-01').maybeSingle()).data))
  await p.goto(`${BASE}/settings/hr?tahun=2099`, { waitUntil: 'networkidle' })
  await p.getByRole('row', { name: new RegExp(`${P} Libur uji`) }).getByRole('button', { name: 'Hapus' }).click()
  check('kalender: libur dihapus', await until(async () => !(await db.from('work_calendar').select('day').eq('day', HOLIDAY).maybeSingle()).data))
  await p.fill('#hours_per_day', '0')
  await p.getByRole('button', { name: 'Simpan aturan' }).click()
  check('aturan tidak sah ditolak', await seen(p.getByRole('alert').filter({ hasText: 'Jam kerja per hari' })))

  // Data karyawan
  await p.goto(`${BASE}/users/${member.id}`, { waitUntil: 'networkidle' })
  await p.selectOption('#emp_division', 'HR')
  await p.selectOption('#emp_level', 'STAFF')
  await p.fill('#emp_join', '2025-01-02')
  await p.fill('#emp_quota', '12')
  await p.check('#emp_tracker')
  await p.getByRole('button', { name: 'Simpan data karyawan' }).click()
  check('data karyawan tersimpan (termasuk wajib isi tracker)', await until(async () => {
    const r = (await db.from('profiles').select('division, position_level, join_date, annual_leave_quota, tracker_required').eq('id', member.id).single()).data
    return r?.division === 'HR' && r.position_level === 'STAFF' && r.join_date === '2025-01-02' && r.annual_leave_quota === 12 && r.tracker_required === true
  }))

  // Import histori Excel (data palsu)
  const d1 = day(-3)
  const file = path.join(OUT_DIR, 'uji-import-tracker.xlsx')
  fs.mkdirSync(OUT_DIR, { recursive: true })
  const header = ['Tanggal', 'Minggu Ke-', 'Nama', 'Divisi', 'Proyek', 'Aktifitas', 'Detail', 'Jam Mulai', 'Jam Selesai', 'Durasi', 'Lokasi', 'Kategori', 'Output']
  const rows = [
    header,
    [serial(d1), 1, `${P} Karyawan HR`, 'HR', 'Manajemen Perusahaan', `${P} Import 1`, '', 0.375, 0.5, 3, 'WFA', 'Administrasi', 'Laporan'],
    [serial(d1), 1, `${P} Karyawan HR`, 'HR', `${P} Klien Bebas`, `${P} Import 2`, '', 0.5, 0.5625, 1.5, 'Rumah', 'Meeting', ''],
    [serial(d1), 1, `${P} Karyawan HR`, 'HR', 'Potensial', `${P} Lewat malam`, '', 0.9, 0.1, -19, 'WFA', 'Meeting', ''],
  ]
  spawnSync('python3', ['scripts/e2e/make-xlsx.py', file, JSON.stringify({ 'Daily November 26': rows, 'Daily Sum': [['ringkasan']] })])
  const imported = async () => (await db.from('work_logs').select('id, source, internal_project_ref, project_name, duration_minutes').eq('user_id', member.id).eq('source', 'IMPORT')).data ?? []
  for (const round of [1, 2]) {
    await p.goto(`${BASE}/tracker/import`, { waitUntil: 'networkidle' })
    await p.setInputFiles('input[name="file"]', file)
    await p.getByRole('button', { name: 'Import', exact: true }).click()
    await seen(p.getByRole('status'))
    check(`import ke-${round}: 2 aktivitas (lewat malam dilewati)`, await until(async () => (await imported()).length === 2), JSON.stringify(await imported()))
  }
  const imp = await imported()
  check('import: proyek internal tertaut', imp.some((r) => r.internal_project_ref && r.project_name === 'Manajemen Perusahaan'))
  check('import: durasi 180 + 90 menit', imp.map((r) => r.duration_minutes).sort((a, b) => a - b).join(',') === '90,180', imp.map((r) => r.duration_minutes).join(','))
  check('import: entri APP tidak tersentuh', ((await db.from('work_logs').select('id').eq('id', log.id)).data ?? []).length === 1)
  const badFile = path.join(OUT_DIR, 'uji-import-nama-salah.xlsx')
  spawnSync('python3', ['scripts/e2e/make-xlsx.py', badFile, JSON.stringify({ 'Daily November 26': [header, [serial(d1), 1, `${P} Orang Tak Dikenal`, 'HR', 'Potensial', 'x', '', 0.375, 0.5, 3, 'WFA', 'Meeting', 'y']] })])
  await p.goto(`${BASE}/tracker/import`, { waitUntil: 'networkidle' })
  await p.setInputFiles('input[name="file"]', badFile)
  await p.getByRole('button', { name: 'Import', exact: true }).click()
  check('import: nama tak dikenal ditolak semua', await seen(p.getByRole('alert').filter({ hasText: 'tidak cocok' })))

  // Rekap: rincian per orang memuat daftar aktivitas
  await p.goto(`${BASE}/tracker/rekap?bulan=${today.slice(0, 7)}&orang=${member.id}`, { waitUntil: 'networkidle' })
  check('rekap: daftar aktivitas per orang', await seen(p.getByText(`${P} Import 1`)))
  check('rekap: divisi karyawan tampil', (await p.getByRole('row').filter({ hasText: `${P} Karyawan HR` }).getByRole('cell', { name: 'HR', exact: true }).count()) === 1)
  await c.close()

  // 4. Saklar pengingat: tanpa izin 401; dengan secret tetapi saklar mati = tidak mengirim
  const secret = loadEnv().CRON_SECRET
  const r401 = await fetch(`${BASE}/api/cron/tracker`)
  check('cron tracker: tanpa secret 401', r401.status === 401)
  const r = await fetch(`${BASE}/api/cron/tracker`, { headers: { authorization: `Bearer ${secret}` } })
  const body = await r.json().catch(() => ({}))
  check('cron tracker: saklar mati, tidak mengirim', r.status === 200 && body.skipped === 'disabled', JSON.stringify(body))
} catch (e) {
  check('EXC', false, e.message.split('\n')[0])
} finally {
  await browser.close().catch(() => {})
  await db.from('work_calendar').delete().eq('day', HOLIDAY)
  await db.from('hr_month_targets').delete().eq('month', '2099-01-01')
  cleanupResult = await runCleanup(db)
}

const left = userIds.length ? ((await db.from('work_logs').select('id').in('user_id', userIds)).data ?? []).length : 0
check('pembersihan: work_logs uji terhapus', left === 0, left)
check('pembersihan: kalender & target 2099 bersih', !(await db.from('work_calendar').select('day').eq('day', HOLIDAY).maybeSingle()).data)
const ok = results.filter((x) => x.ok).length
for (const x of results) console.log(`${x.ok ? 'OK   ' : 'GAGAL'} ${x.name}${x.ok ? '' : ' :: ' + x.info}`)
console.log(`cek: ${ok}/${results.length} lulus`)
console.log('pembersihan: sisa:', JSON.stringify(cleanupResult?.left ?? cleanupResult))
writeOut('hr-result.json', results)
process.exit(ok === results.length ? 0 : 1)
