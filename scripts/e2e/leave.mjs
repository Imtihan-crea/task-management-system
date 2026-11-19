// Uji Cuti / izin / sakit (HR Tahap 2, 16 Nov 2026): ajukan, hitung hari kerja, tolak
// bertumpuk, batalkan sendiri, setujui/tolak oleh penyetuju, saldo, rekap, akses.
// Data uji berawalan "UJI-E2E"; leave_requests ikut terhapus bersama user uji.
import { guard, serviceClient, loadPlaywright, loginPassword, makeUser, runCleanup, writeOut, day, BASE, PREFIX as P } from './lib.mjs'

await guard()
const db = serviceClient()
const results = []
const check = (name, ok, info = '') => results.push({ name, ok: Boolean(ok), info: String(info).slice(0, 200) })
const until = async (fn, ms = 10000) => {
  for (let t = 0; t < ms; t += 250) { if (await fn()) return true; await new Promise((r) => setTimeout(r, 250)) }
  return false
}
const seen = (loc) => loc.first().waitFor({ timeout: 10000 }).then(() => true, () => false)
// Senin depan (hari kerja; akhir Nov 2026 tanpa libur nasional) + Selasa.
const base = new Date(`${day(0)}T00:00:00Z`)
base.setUTCDate(base.getUTCDate() + ((8 - base.getUTCDay()) % 7 || 7))
const iso = (d) => d.toISOString().slice(0, 10)
const mon = iso(base)
const tue = iso(new Date(base.getTime() + 86400000))
const thu = iso(new Date(base.getTime() + 3 * 86400000))
const sat = iso(new Date(base.getTime() + 5 * 86400000))
const leaves = async (uid) => (await db.from('leave_requests').select('id, kind, start_date, end_date, days, status, decided_by').eq('user_id', uid).order('start_date')).data ?? []

const browser = await loadPlaywright().chromium.launch({ headless: true })
let cleanupResult
const userIds = []
try {
  const member = await makeUser(db, 'cuti', 'TEAM_MEMBER', `${P} Karyawan Cuti`)
  const approver = await makeUser(db, 'penyetuju', 'ADMIN', `${P} Penyetuju`)
  userIds.push(member.id, approver.id)
  await db.from('profiles').update({ annual_leave_quota: 12 }).eq('id', member.id)
  await db.from('user_permissions').insert({ user_id: approver.id, permission: 'leave.approve', project_id: null, granted: true })

  const mc = await browser.newContext()
  const m = await mc.newPage()
  m.on('dialog', (d) => d.accept())
  await loginPassword(m, member)
  const submit = async (kind, start, end = '') => {
    await m.goto(`${BASE}/cuti`, { waitUntil: 'networkidle' })
    await m.selectOption('#leave_kind', kind)
    await m.fill('#leave_start', start)
    await m.fill('#leave_end', end)
    await m.fill('#leave_reason', `${P} alasan`)
    await m.getByRole('button', { name: 'Ajukan' }).click()
  }

  await submit('CUTI', mon, tue)
  check('ajukan cuti 2 hari kerja', await until(async () => (await leaves(member.id))[0]?.days === 2))
  await submit('TANPA_GAJI', tue, thu)
  check('bertumpuk ditolak', await seen(m.getByRole('alert').filter({ hasText: 'Sudah ada pengajuan' })))
  await submit('SAKIT', sat)
  check('akhir pekan saja ditolak', await seen(m.getByRole('alert').filter({ hasText: 'tidak berisi hari kerja' })))
  await submit('TANPA_GAJI', thu)
  check('ajukan izin 1 hari', await until(async () => (await leaves(member.id)).length === 2))
  await m.goto(`${BASE}/cuti`, { waitUntil: 'networkidle' })
  await m.getByRole('row').filter({ hasText: 'Izin' }).getByRole('button', { name: 'Batalkan' }).click()
  check('batalkan pengajuan sendiri', await until(async () => (await leaves(member.id)).some((l) => l.kind === 'TANPA_GAJI' && l.status === 'CANCELLED')))
  await m.goto(`${BASE}/cuti/persetujuan`, { waitUntil: 'networkidle' })
  check('karyawan tanpa izin: persetujuan ditolak', /portal/.test(m.url()))
  check('notifikasi ke penyetuju', await until(async () => ((await db.from('notifications').select('id').eq('user_id', approver.id).eq('type', 'LEAVE_REQUESTED')).data ?? []).length >= 2))

  // Penyetuju
  const ac = await browser.newContext()
  const a = await ac.newPage()
  a.on('dialog', (d) => d.accept())
  await loginPassword(a, approver)
  await a.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' })
  check('menu Persetujuan Cuti tampil untuk penyetuju', (await a.getByRole('link', { name: 'Persetujuan Cuti' }).count()) === 1)
  await a.goto(`${BASE}/cuti/persetujuan`, { waitUntil: 'networkidle' })
  const pend = a.locator('section').filter({ hasText: 'Menunggu persetujuan' }).getByRole('row').filter({ hasText: `${P} Karyawan Cuti` })
  await pend.getByRole('textbox').fill('Selamat berlibur')
  await pend.getByRole('button', { name: 'Setujui' }).click()
  check('setujui cuti', await until(async () => (await leaves(member.id)).some((l) => l.kind === 'CUTI' && l.status === 'APPROVED' && l.decided_by === approver.id)))
  check('notifikasi keputusan ke karyawan', await until(async () => ((await db.from('notifications').select('id').eq('user_id', member.id).eq('type', 'LEAVE_DECIDED')).data ?? []).length === 1))
  // Klik notifikasi membuka halaman yang benar (dulu jatuh ke dashboard).
  await m.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' })
  await m.locator('button[aria-label="Notifications"]').first().click()
  await m.getByRole('dialog', { name: 'Notifications' }).getByText(/disetujui/).first().click()
  check('klik notifikasi keputusan membuka /cuti', await m.waitForURL(/\/cuti$/, { timeout: 10000 }).then(() => true, () => false), m.url())
  await a.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' })
  await a.locator('button[aria-label="Notifications"]').first().click()
  await a.getByRole('dialog', { name: 'Notifications' }).getByText(/Pengajuan .* baru/).first().click()
  check('klik notifikasi pengajuan membuka /cuti/persetujuan', await a.waitForURL(/\/cuti\/persetujuan/, { timeout: 10000 }).then(() => true, () => false), a.url())

  // Penyetuju mengajukan sendiri: tidak bisa menyetujui miliknya
  await a.goto(`${BASE}/cuti`, { waitUntil: 'networkidle' })
  await a.selectOption('#leave_kind', 'SAKIT')
  await a.fill('#leave_start', thu)
  await a.getByRole('button', { name: 'Ajukan' }).click()
  await until(async () => (await leaves(approver.id)).length === 1)
  await a.goto(`${BASE}/cuti/persetujuan`, { waitUntil: 'networkidle' })
  const own = a.locator('section').filter({ hasText: 'Menunggu persetujuan' }).getByRole('row').filter({ hasText: `${P} Penyetuju` })
  check('pengajuan sendiri tanpa tombol setujui', (await own.getByRole('button', { name: 'Setujui' }).count()) === 0)

  // Saldo & rekap
  await m.goto(`${BASE}/cuti`, { waitUntil: 'networkidle' })
  const sisa = await m.locator('text=Sisa cuti').locator('..').innerText()
  check('saldo sisa 10 (12 − 2)', /\b10\b/.test(sisa), sisa)
  await a.goto(`${BASE}/cuti/persetujuan`, { waitUntil: 'networkidle' })
  const bal = a.locator('section').filter({ hasText: 'Saldo cuti tahunan' }).getByRole('row').filter({ hasText: `${P} Karyawan Cuti` })
  check('tabel saldo penyetuju', /12\s+2\s+0\s+10/.test((await bal.innerText()).replace(/\s+/g, ' ')), await bal.innerText())

  // Batalkan cuti yang sudah disetujui
  await a.goto(`${BASE}/cuti/persetujuan?bulan=${mon.slice(0, 7)}`, { waitUntil: 'networkidle' })
  const appr = a.locator('section').filter({ hasText: 'Semua pengajuan' }).getByRole('row').filter({ hasText: `${P} Karyawan Cuti` }).filter({ hasText: 'Disetujui' })
  await appr.getByRole('button', { name: 'Batalkan' }).click()
  check('penyetuju membatalkan cuti disetujui', await until(async () => (await leaves(member.id)).some((l) => l.kind === 'CUTI' && l.status === 'CANCELLED')))
  await mc.close()
  await ac.close()
} catch (e) {
  check('EXC', false, e.message.split('\n')[0])
} finally {
  await browser.close().catch(() => {})
  // Pengajuan uji ikut mengabari penyetuju sungguhan (Developer, HR): hapus notifikasinya.
  await db.from('notifications').delete().in('type', ['LEAVE_REQUESTED', 'LEAVE_DECIDED']).like('message', `${P}%`)
  cleanupResult = await runCleanup(db)
}
const left = userIds.length ? ((await db.from('leave_requests').select('id').in('user_id', userIds)).data ?? []).length : 0
check('pembersihan: cuti uji terhapus', left === 0, left)
const leaked = ((await db.from('notifications').select('id').in('type', ['LEAVE_REQUESTED', 'LEAVE_DECIDED']).like('message', `${P}%`)).data ?? []).length
check('pembersihan: notifikasi uji di akun sungguhan terhapus', leaked === 0, leaked)
const ok = results.filter((r) => r.ok).length
for (const r of results) console.log(`${r.ok ? 'OK   ' : 'GAGAL'} ${r.name}${r.ok ? '' : ' :: ' + r.info}`)
console.log(`cek: ${ok}/${results.length} lulus`)
console.log('pembersihan: sisa:', JSON.stringify(cleanupResult?.left ?? cleanupResult))
writeOut('leave-result.json', results)
process.exit(ok === results.length ? 0 : 1)
