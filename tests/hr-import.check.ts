/**
 * Uji lib/hr/import-tracker.ts — import histori Daily Tracker (data palsu).
 * Jalankan: npx tsx tests/hr-import.check.ts
 */
import { buildImport, buildLeaveImport, datesByUser, dropAppOverlaps, isDailySheet, parseClock, parseDate, rangesByUser, summarize } from '../lib/hr/import-tracker'
import type { ReferenceRow } from '../lib/hr/reference'

let ok = 0
let gagal = 0
function cek(label: string, aktual: unknown, harap: unknown): void {
  if (JSON.stringify(aktual) === JSON.stringify(harap)) ok++
  else {
    gagal++
    console.log(`  [GAGAL] ${label} -> ${JSON.stringify(aktual)} (harus ${JSON.stringify(harap)})`)
  }
}

// Waktu
cek('Date 1899-12-30T09:30', parseClock(new Date('1899-12-30T09:30:00Z')), '09:30')
cek('Date dengan selisih detik', parseClock(new Date('1899-12-30T09:00:28Z')), '09:00')
cek('pecahan 0.375', parseClock(0.375), '09:00')
cek('angka seri + pecahan', parseClock(46000.5), '12:00')
cek('teks 9:00', parseClock('9:00'), '09:00')
cek('teks 09:00', parseClock('09:00'), '09:00')
cek('teks 09:00:00', parseClock('09:00:00'), '09:00')
cek('teks rusak', parseClock('sore'), null)
cek('24:00 ditolak', parseClock('24:00'), null)
cek('kosong', parseClock(null), null)
cek('Date invalid', parseClock(new Date('x')), null)

// Tanggal
cek('Date', parseDate(new Date('2026-10-05T00:00:00Z')), '2026-10-05')
cek('angka seri 46000', parseDate(46000), '2025-12-09')
cek('teks ISO', parseDate('2026-10-05'), '2026-10-05')
cek('teks DD/MM/YYYY', parseDate('5/10/2026'), '2026-10-05')
cek('teks rusak', parseDate('kemarin'), null)
cek('kosong', parseDate(''), null)

// Sheet
cek('Daily Oktober 26', isDailySheet('Daily Oktober 26'), true)
cek('daily november 26 kecil', isDailySheet('daily November 26'), true)
cek('Daily 2025 dilewati', isDailySheet('Daily 2025'), false)
cek('Daily 2026 dilewati', isDailySheet('Daily 2026'), false)
cek('Daily Sum dilewati', isDailySheet('Daily Sum'), false)
cek('sheet lain dilewati', isDailySheet('Monthly Summary'), false)
cek('Dailyx bukan Daily', isDailySheet('Dailyx'), false)

// Konteks palsu
const ref = (id: string, list: ReferenceRow['list'], label: string, archived = false): ReferenceRow => ({
  id, list, code: id, label, description: null, sort_order: 10, archived_at: archived ? '2026-01-01' : null,
})
const ctx = {
  users: [{ id: 'u1', full_name: 'Budi Santoso' }, { id: 'u2', full_name: 'Sari Dewi' }, { id: 'u3', full_name: null }],
  projects: [{ id: 'p1', name: 'Proyek Alfa' }],
  refs: [
    ref('i1', 'INTERNAL_PROJECT', 'Urusan Kantor'),
    ref('i2', 'INTERNAL_PROJECT', 'Calon Klien Lama', true),
    ref('c1', 'ACTIVITY_CATEGORY', 'Meeting'),
    ref('c2', 'ACTIVITY_CATEGORY', 'Desain Lama', true),
    ref('l1', 'WORK_LOCATION', 'Kantor'),
  ],
  today: '2026-11-16',
}
const HEAD = ['Tanggal', 'Minggu', 'Nama', 'Divisi', 'Proyek', 'Aktifitas', 'Detail', 'Mulai', 'Selesai', 'Durasi', 'Lokasi', 'Kategori', 'Output']
const baris = (o: Partial<Record<number, unknown>>) => {
  const r: unknown[] = ['2026-10-05', 1, 'Budi Santoso', 'IT', 'Proyek Alfa', 'Rapat', 'detail', '09:00', '10:30', '', 'Kantor', 'Meeting', 'notulen']
  for (const [k, v] of Object.entries(o)) r[+k] = v
  return r as never
}
const sheet = (name: string, ...rows: unknown[][]) => ({ sheet: name, data: [HEAD, ...rows] as never })

// Baris normal + cocok master
let b = buildImport([sheet('Daily Oktober 26', baris({}))], ctx)
cek('1 baris diterima', b.rows.length, 1)
cek('project TMS', [b.rows[0].project_id, b.rows[0].project_name, b.rows[0].internal_project_ref], ['p1', 'Proyek Alfa', null])
cek('kategori+lokasi ref', [b.rows[0].category_ref, b.rows[0].location_ref], ['c1', 'l1'])
cek('source IMPORT', b.rows[0].source, 'IMPORT')
cek('jam', [b.rows[0].start_time, b.rows[0].end_time], ['09:00', '10:30'])

// Nama beda huruf/spasi
b = buildImport([sheet('Daily Oktober 26', baris({ 2: '  budi   SANTOSO ' }))], ctx)
cek('nama dirapikan', b.rows[0]?.user_id, 'u1')

// Baris kosong diam-diam
b = buildImport([sheet('Daily Oktober 26', [], ['', '', '', '', '', '', '', '', '', '', '', '', ''], baris({}))], ctx)
cek('baris kosong dilewati diam', [b.rows.length, Object.values(b.skipped).reduce((a, c) => a + c, 0)], [1, 0])

// Nama tak dikenal dikumpulkan, tanpa duplikat
b = buildImport([sheet('Daily Oktober 26', baris({ 2: 'Orang Asing' }), baris({ 2: 'orang asing' }), baris({ 2: 'Zed' }))], ctx)
cek('nama tak dikenal', b.unknownNames, ['Orang Asing', 'Zed'])

// Nama ganda di profil = tidak dikenal
const ganda = { ...ctx, users: [...ctx.users, { id: 'u9', full_name: 'Budi Santoso' }] }
cek('nama ganda tak dikenal', buildImport([sheet('Daily Oktober 26', baris({}))], ganda).unknownNames, ['Budi Santoso'])

// Lewat tengah malam & jam rusak
b = buildImport([sheet('Daily Oktober 26',
  baris({ 7: '22:00', 8: '01:00' }), baris({ 7: '09:00', 8: '09:00' }), baris({ 7: 'x' }), baris({ 8: null }))], ctx)
cek('jam dilewati', [b.rows.length, b.skipped.time], [0, 4])
// Selesai tepat tengah malam (00:00 di sheet) = 24:00, jamnya ikut (cocok dengan sheet Okt 2026)
b = buildImport([sheet('Daily Oktober 26', baris({ 7: '22:45', 8: '00:00' }), baris({ 7: '00:00', 8: '00:00' }))], ctx)
cek('selesai 00:00 jadi 24:00', [b.rows.length, b.rows[0]?.end_time, b.skipped.time], [1, '24:00', 1])

// Tanggal
b = buildImport([sheet('Daily Oktober 26', baris({ 0: 'rusak' }), baris({ 0: '2026-11-17' }), baris({ 0: '2026-11-16' }), baris({ 0: null }))], ctx)
cek('tanggal rusak/masa depan/hari ini', [b.rows.length, b.skipped.date, b.skipped.future], [1, 2, 1])

// Proyek: internal, arsip, teks bebas, kosong
b = buildImport([sheet('Daily Oktober 26',
  baris({ 4: 'urusan kantor' }), baris({ 4: 'Calon Klien Lama' }), baris({ 4: 'Proyek Baru X' }), baris({ 4: 'proyek baru x' }), baris({ 4: '' }))], ctx)
cek('internal', [b.rows[0].project_id, b.rows[0].internal_project_ref, b.rows[0].project_name], [null, 'i1', 'Urusan Kantor'])
cek('internal arsip cocok', [b.rows[1].internal_project_ref, b.rows[1].project_name], ['i2', 'Calon Klien Lama'])
cek('proyek teks bebas', [b.rows[2].project_id, b.rows[2].internal_project_ref, b.rows[2].project_name], [null, null, 'Proyek Baru X'])
cek('proyek kosong dilewati', [b.rows.length, b.skipped.noProject], [4, 1])
cek('teks bebas proyek unik', b.free.project, 1)

// Kategori & lokasi: arsip, bebas, kosong, > 60
const panjang = 'x'.repeat(61)
b = buildImport([sheet('Daily Oktober 26',
  baris({ 11: 'desain lama' }), baris({ 11: 'Kategori Baru', 10: 'Rumah' }), baris({ 11: '' }), baris({ 10: '' }), baris({ 11: panjang }), baris({ 10: panjang }))], ctx)
cek('kategori arsip cocok', [b.rows[0].category_ref, b.rows[0].category], ['c2', 'Desain Lama'])
cek('kategori+lokasi bebas', [b.rows[1].category_ref, b.rows[1].category, b.rows[1].location_ref, b.rows[1].location], [null, 'Kategori Baru', null, 'Rumah'])
cek('kosong diimport sbg teks bebas, panjang dilewati', [b.rows.length, b.rows[2].category, b.rows[2].category_ref, b.rows[3].location, b.skipped.tooLong], [4, '(tanpa kategori)', null, '(tanpa lokasi)', 2])
cek('hitung teks bebas', b.free, { project: 0, category: 2, location: 2 })

// Pemotongan teks panjang & aktivitas kosong
b = buildImport([sheet('Daily Oktober 26', baris({ 5: 'a'.repeat(400), 6: 'd'.repeat(6000), 12: 'o'.repeat(3000) }), baris({ 5: '' }))], ctx)
cek('activity 300', b.rows[0].activity.length, 300)
cek('detail 5000', b.rows[0].detail?.length, 5000)
cek('output 2000', b.rows[0].output?.length, 2000)
cek('aktivitas kosong -> -', b.rows[1].activity, '-')

// Pilih sheet, banyak sheet
b = buildImport([sheet('Daily Oktober 26', baris({})), sheet('Daily November 26', baris({ 2: 'Sari Dewi' })), sheet('Daily Sum', baris({})), sheet('Daily 2026', baris({}))], ctx)
cek('hanya sheet bulanan', [b.sheets, b.rows.length], [['Daily Oktober 26', 'Daily November 26'], 2])
cek('tanpa sheet Daily', buildImport([sheet('Daily Sum', baris({}))], ctx).sheets, [])

// Rentang per user & ringkasan
b = buildImport([sheet('Daily Oktober 26', baris({ 0: '2026-10-09' }), baris({ 0: '2026-10-02' }), baris({ 2: 'Sari Dewi' }))], ctx)
cek('rentang per user', [...rangesByUser(b.rows)], [['u1', { from: '2026-10-02', to: '2026-10-09' }], ['u2', { from: '2026-10-05', to: '2026-10-05' }]])
const s = summarize(b)
cek('ringkasan', s.startsWith('3 aktivitas diimport untuk 2 orang (2026-10-02 s/d 2026-10-09).'), true)

// Tanggal yang tidak ada ditolak (review 16 Nov 2026), bukan digeser
cek('31/02/2026 ditolak', parseDate('31/02/2026'), null)
cek('2026-02-30 ditolak', parseDate('2026-02-30'), null)
cek('29/02/2028 kabisat sah', parseDate('29/02/2028'), '2028-02-29')

// Bentrok dengan entri APP dibuang; bentrok antar baris berkas dibiarkan
b = buildImport([sheet('Daily Oktober 26', baris({ 0: '2026-10-09' }), baris({ 0: '2026-10-09' }), baris({ 0: '2026-10-10' }))], ctx)
const tanpaBentrok = dropAppOverlaps(b, [{ user_id: 'u1', work_date: '2026-10-09', start_time: '09:30:00', end_time: '09:45:00' }])
cek('bentrok APP dilewati', [tanpaBentrok.rows.length, tanpaBentrok.skipped.overlap], [1, 2])
cek('tanpa entri APP tetap', dropAppOverlaps(b, []).rows.length, 3)
cek('APP hari lain tidak berpengaruh', dropAppOverlaps(b, [{ user_id: 'u2', work_date: '2026-10-09', start_time: '00:00', end_time: '23:59' }]).rows.length, 3)
cek('ringkasan menyebut bentrok', summarize(tanpaBentrok).includes('2 bentrok jam'), true)

// Import ulang hanya mengganti tanggal yang ada di berkas
cek('tanggal per user', [...datesByUser(b.rows)], [['u1', ['2026-10-09', '2026-10-10']]])

// Leave Form (HR Tahap 2)
const LF_HEAD = ['Tanggal', 'Month', 'Nama', 'Divisi', 'Kategori', 'Keterangan', '', 'Nama', 'Tanggal Masuk', 'Lama', 'Hak Cuti Tahunan', 'Cuti Diambil', 'Sisa']
const lf = { sheet: 'Leave Form', data: [
  ['Tanggal', 'Month', 'Nama', 'Divisi', 'Kategori', 'Keterangan', '', 'Nama', 'Tanggal Masuk', 'Lama', 'Hak Cuti Tahunan', 'Cuti Diambil', 'Sisa'],
  ['2026-02-13', 'Feb', 'Budi Santoso', 'IT', 'Sakit', 'demam', '', 'Budi Santoso', '2023-05-15', '', 12, '', 12],
  ['2026-06-08', 'Jun', 'budi santoso', 'IT', 'Cuti', '', '', 'Orang Asing', '2024-01-01', '', 0, '', 0],
  ['2026-06-09', 'Jun', 'Budi Santoso', 'IT', 'Libur', '', '', '', '', '', '', '', ''],
  ['2027-01-01', 'Jan', 'Budi Santoso', 'IT', 'Izin', '', '', '', '', '', '', '', ''],
  ['', 'Dec', '', '', '', '', '', '', '', '', '', '', ''],
] } as never
const lb = buildLeaveImport([lf], ctx)
cek('leave: log sah', lb.leave, [
  { user_id: 'u1', kind: 'SAKIT', date: '2026-02-13', reason: 'demam' },
  { user_id: 'u1', kind: 'CUTI', date: '2026-06-08', reason: null },
])
cek('leave: kategori aneh & masa depan dilewati', lb.skipped, 2)
cek('leave: data kanan', lb.employees, [{ user_id: 'u1', join_date: '2023-05-15', quota: 12 }])
cek('leave: nama kanan tak cocok tidak memblokir', [lb.unknownNames, lb.unmatchedEmployees], [[], ['Orang Asing']])
const lb2 = buildLeaveImport([{ sheet: 'Leave Form', data: [LF_HEAD, ['', '', '', '', '', '', '', 'Muhammad Budi Santoso Putra', '2022-01-03', '', 12]] } as never], ctx)
cek('leave: nama lengkap resmi cocok ke profil', lb2.employees, [{ user_id: 'u1', join_date: '2022-01-03', quota: 12 }])
cek('leave: nama log tak dikenal memblokir', buildLeaveImport([{ sheet: 'Leave Form', data: [LF_HEAD, ['2026-02-13', '', 'Siapa Ini', '', 'Sakit']] } as never], ctx).unknownNames, ['Siapa Ini'])
cek('leave: tanpa sheet', buildLeaveImport([], ctx), { leave: [], employees: [], unknownNames: [], skipped: 0, unmatchedEmployees: [] })

console.log(`${ok} lulus, ${gagal} gagal`)
if (gagal > 0) process.exit(1)
