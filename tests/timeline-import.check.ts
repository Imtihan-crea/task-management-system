/**
 * Uji lib/import/timeline.ts — parser sheet Timeline untuk import task.
 * Jalankan: npm run test:import
 */
import { importKey, parseTimeline, toDateInput } from '../lib/import/timeline'

let ok = 0
let gagal = 0

function cek(label: string, aktual: unknown, harap: unknown): void {
  if (JSON.stringify(aktual) === JSON.stringify(harap)) {
    ok++
  } else {
    gagal++
    console.log(`  [GAGAL] ${label} -> ${JSON.stringify(aktual)} (harus ${JSON.stringify(harap)})`)
  }
}

const d = (s: string) => new Date(`${s}T00:00:00.000Z`)
const HEADER = ['No', 'Divisi', 'Task', 'Jenis', 'PIC (peran)', 'Nama PIC', 'Mulai', 'Deadline',
  'Progres manual % (isi)', 'Progres % (otomatis)', 'Status', 'Tgl Selesai', 'Akhir bar', 'Hari telat',
  'Keterangan', 'Catatan / update']
const row = (o: Partial<Record<string, unknown>>) => [
  o.no ?? 1, o.divisi ?? 'Ads', o.title ?? 'Task A', o.jenis ?? 'Task', o.peran ?? 'PIC Ads', o.pic ?? 'HANDY',
  o.start ?? d('2026-11-07'), o.deadline ?? d('2026-11-10'), o.progress ?? 0, null, o.status ?? 'Belum mulai',
  o.done ?? null, null, null, null, o.note ?? null,
] as never[]
const parse = (...rows: never[][]) => parseTimeline([['judul'], [], HEADER as never[], ...rows])

// Tanggal
cek('Date', toDateInput(d('2026-11-07')), '2026-11-07')
cek('serial Excel', toDateInput(46333), '2026-11-07')
cek('teks DD/MM/YYYY', toDateInput('07/11/2026'), '2026-11-07')
cek('kosong', toDateInput(null), null)
cek('ngawur', toDateInput('besok'), 'invalid')

// Baris normal
const a = parse(row({ note: 'cek stok', progress: 0.5, status: 'Berjalan' }))
cek('tanpa error', a.errors, [])
cek('field', a.rows[0] && [a.rows[0].excelRow, a.rows[0].divisi, a.rows[0].picName, a.rows[0].startDate, a.rows[0].deadline, a.rows[0].status],
  [4, 'Ads', 'HANDY', '2026-11-07', '2026-11-10', 'IN_PROGRESS'])
cek('deskripsi', a.rows[0]?.description, 'Jenis: Task\nPIC: HANDY (PIC Ads)\nProgres: 50%\nCatatan: cek stok')

// Status
cek('status kosong = TODO', parse(row({ status: '' })).rows[0]?.status, 'TODO')
cek('Selesai = DONE + tgl', [parse(row({ status: 'Selesai', done: d('2026-11-09') })).rows[0]?.status,
  parse(row({ status: 'Selesai', done: d('2026-11-09') })).rows[0]?.completedDate], ['DONE', '2026-11-09'])
cek('progres 100% = DONE', parse(row({ status: 'Berjalan', progress: 1 })).rows[0]?.status, 'DONE')
cek('Batal tetap CANCELLED', parse(row({ status: 'Batal', progress: 1 })).rows[0]?.status, 'CANCELLED')
cek('tgl selesai diabaikan bila belum DONE', parse(row({ done: d('2026-11-09') })).rows[0]?.completedDate, null)

// Baris dilewati / ditolak
cek('baris tanpa judul dilewati', parse(row({ title: '' })).rows.length, 0)
cek('status asing ditolak', parse(row({ status: 'Pending' })).errors.length, 1)
cek('deadline < mulai ditolak', parse(row({ start: d('2026-11-12') })).errors.length, 1)
cek('PIC kosong pakai peran', parse(row({ pic: '' })).rows[0]?.picName, 'PIC Ads')
cek('judul ganda di divisi sama ditolak', parse(row({}), row({ title: ' task  a ' })).errors.length, 1)
cek('judul sama beda divisi boleh', parse(row({}), row({ divisi: 'Live' })).rows.length, 2)
cek('header hilang', parseTimeline([['a', 'b']]).errors.length, 1)
cek('importKey', importKey(' Ads', '  Setup   Ads '), 'ads|setup ads')

console.log(`LULUS: ${ok}`)
console.log(`GAGAL: ${gagal}`)
if (gagal > 0) process.exit(1)
