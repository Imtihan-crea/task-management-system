/**
 * Uji tombol Export Excel lewat server sungguhan (next start, email mati).
 * - Developer uji: semua route export mengembalikan .xlsx yang bisa dibaca, tata letak judul/info/header benar.
 * - TEAM_MEMBER uji: route HR/users/project lain TIDAK mengembalikan berkas.
 * Jalankan: E2E_CONFIRM_PRODUCTION=ya npm run e2e:export
 */
import { createRequire } from 'node:module'
import { BASE, REPO, guard, loadPlaywright, loginAdmin, loginPassword, makeAdminDeveloper, makeUser, runCleanup, serviceClient, writeOut } from './lib.mjs'

const readXlsx = createRequire(REPO + '/')('read-excel-file/node').default
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const month = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 7)

await guard()
const db = serviceClient()
const { chromium } = loadPlaywright()
const browser = await chromium.launch()
const hasil = []
let gagal = 0
const catat = (ok, label, detail) => { if (!ok) gagal++; hasil.push(`${ok ? 'OK   ' : 'GAGAL'} ${label}${detail ? ' — ' + detail : ''}`) }

try {
  const { data: proj } = await db.from('projects').select('id').limit(1).single()
  await makeAdminDeveloper(db)
  const page = await browser.newPage()
  await loginAdmin(db, page)
  const urls = [
    `/tracker/rekap/export?bulan=${month}`, `/tracker/export?bulan=${month}`, '/cuti/export', `/cuti/persetujuan/export?bulan=${month}`,
    '/tasks/export', '/tasks/export?view=overdue', `/projects/${proj.id}/export/tasks`, `/projects/${proj.id}/export/tracker?bulan=${month}`,
    '/meetings/export', '/workstreams/export', '/users/export', '/activity/export',
  ]
  for (const u of urls) {
    const res = await page.request.get(BASE + u)
    const type = res.headers()['content-type'] ?? ''
    if (res.status() !== 200 || !type.includes(XLSX)) { catat(false, u, `status ${res.status()} ${type}`); continue }
    const sheets = await readXlsx(await res.body())
    // Tata letak: judul, info..., baris kosong, header (sel pertama terisi), data.
    const headerAt = (s) => s.data.findIndex((r, i) => i > 0 && r.every((c) => c === null)) + 1
    const bad = sheets.filter((s) => !s.data[0][0] || headerAt(s) < 2 || !s.data[headerAt(s)]?.[0])
    catat(bad.length === 0, u, sheets.map((s) => `${s.sheet}:${s.data.length - headerAt(s) - 1} baris`).join(', ') + (bad.length ? ' TATA LETAK SALAH: ' + bad.map((s) => s.sheet) : ''))
  }

  const anggota = await makeUser(db, 'export-anggota', 'TEAM_MEMBER', 'UJI-E2E Anggota')
  const p2 = await browser.newPage()
  await loginPassword(p2, anggota)
  for (const u of ['/tracker/rekap/export', '/cuti/persetujuan/export', '/users/export', `/projects/${proj.id}/export/tasks`, `/projects/${proj.id}/export/tracker`]) {
    const res = await p2.request.get(BASE + u)
    const type = res.headers()['content-type'] ?? ''
    catat(!type.includes(XLSX), `anggota ditolak ${u}`, `status ${res.status()}`)
  }
  const own = await p2.request.get(BASE + `/tracker/export?bulan=${month}`)
  catat((own.headers()['content-type'] ?? '').includes(XLSX), 'anggota boleh export tracker sendiri')
} finally {
  await browser.close()
  const sisa = await runCleanup(db)
  if (!sisa.ok) gagal++
  hasil.push(`cleanup: ${sisa.ok ? 'bersih' : 'SISA ' + JSON.stringify(sisa.left)}`)
}
console.log(hasil.join('\n'))
writeOut('export-result.json', hasil)
process.exit(gagal ? 1 : 0)
