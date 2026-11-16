/**
 * Uji lib/hr/tracker.ts — Daily Tracker (HR Tahap 1).
 * Angka contoh dari sheet Monthly Summary / Daily Sum (rumus, bukan data karyawan).
 * Jalankan: npm run test:hr-tracker
 */
import {
  DEFAULT_RULES, breakdown, dailyStatus, rulesError, durationMinutes, findOverlap, isoWeek, mergeRules, monthRange,
  monthlyStatus, monthlySummary, parseTime, suggestStart, weekStart, weeklyStatus, workingDays,
  type LogRow,
} from '../lib/hr/tracker'

let ok = 0
let gagal = 0
function cek(label: string, aktual: unknown, harap: unknown): void {
  if (JSON.stringify(aktual) === JSON.stringify(harap)) ok++
  else {
    gagal++
    console.log(`  [GAGAL] ${label} -> ${JSON.stringify(aktual)} (harus ${JSON.stringify(harap)})`)
  }
}

// Jam & durasi
cek('parse 08:30', parseTime('08:30'), 510)
cek('parse 08:30:00', parseTime('08:30:00'), 510)
cek('parse 24:00 ditolak', parseTime('24:00'), null)
cek('parse 8:30 ditolak', parseTime('8:30'), null)
cek('durasi 08:00-09:30', durationMinutes('08:00', '09:30'), 90)
cek('durasi lewat tengah malam ditolak', durationMinutes('22:00', '01:00'), null)
cek('durasi nol ditolak', durationMinutes('09:00', '09:00'), null)

// Tumpang tindih & saran jam mulai
const hari = [{ id: 'a', start: '08:00', end: '10:00' }, { id: 'b', start: '10:00', end: '12:00' }]
cek('bersentuhan boleh', findOverlap(hari, { start: '12:00', end: '13:00' }), null)
cek('tumpang tindih ditolak', findOverlap(hari, { start: '11:30', end: '13:00' })?.id, 'b')
cek('di dalam entri lain ditolak', findOverlap(hari, { start: '08:30', end: '09:00' })?.id, 'a')
cek('ubah entri sendiri tidak bentrok dgn diri', findOverlap(hari, { id: 'a', start: '07:30', end: '10:00' }), null)
cek('saran mulai = selesai terakhir', suggestStart(hari), '12:00')
cek('saran mulai hari kosong', suggestStart([]), null)

// Minggu ISO
cek('ISO week 2026-01-01', isoWeek('2026-01-01'), 1)
cek('ISO week 2025-12-29', isoWeek('2025-12-29'), 1)
cek('ISO week 2026-11-16', isoWeek('2026-11-16'), 47)
cek('awal minggu Minggu 22 Nov', weekStart('2026-11-22'), '2026-11-16')
cek('awal minggu Senin', weekStart('2026-11-16'), '2026-11-16')

// Hari kerja
const [awal, akhir] = monthRange('2026-11')
cek('rentang Nov', [awal, akhir], ['2026-11-01', '2026-11-30'])
cek('rentang Feb 2028 kabisat', monthRange('2028-02')[1], '2028-02-29')
cek('hari kerja Nov 2026 tanpa libur', workingDays(awal, akhir, []).length, 21)
cek('libur mengurangi', workingDays(awal, akhir, [{ day: '2026-11-16', kind: 'HOLIDAY' }]).length, 20)
cek('libur di Sabtu tidak mengurangi', workingDays(awal, akhir, [{ day: '2026-11-21', kind: 'HOLIDAY' }]).length, 21)
cek('hari kerja pengganti Sabtu', workingDays(awal, akhir, [{ day: '2026-11-21', kind: 'WORKDAY' }]).length, 22)

// Status (ambang draft)
cek('harian 8.1 lebih', dailyStatus(8.1), 'LEBIH')
cek('harian 8 sesuai', dailyStatus(8), 'SESUAI')
cek('harian 7 sesuai', dailyStatus(7), 'SESUAI')
cek('harian 6.5 cukup', dailyStatus(6.5), 'CUKUP')
cek('harian 5.9 kurang', dailyStatus(5.9), 'KURANG')
cek('mingguan 40 sesuai', weeklyStatus(40), 'SESUAI')
cek('mingguan 40.1 lebih', weeklyStatus(40.1), 'LEBIH')
cek('mingguan 35 cukup (ambang 35.1)', weeklyStatus(35), 'CUKUP')
cek('mingguan 30 kurang', weeklyStatus(30), 'KURANG')
// Nov 2025 sheet: 20 hari -> 160.1 / 140 / 120
cek('bulanan 160 sesuai', monthlyStatus(160, 20), 'SESUAI')
cek('bulanan 160.1 lebih', monthlyStatus(160.1, 20), 'LEBIH')
cek('bulanan 140 sesuai', monthlyStatus(140, 20), 'SESUAI')
cek('bulanan 139.9 cukup', monthlyStatus(139.9, 20), 'CUKUP')
cek('bulanan 119 kurang', monthlyStatus(119, 20), 'KURANG')

// Aturan tersimpan sebagian
cek('merge aturan', mergeRules({ hoursPerDay: 7 }).hoursPerDay, 7)
cek('merge aturan default', mergeRules(null).hoursPerDay, 8)

// Validasi aturan
cek('aturan default sah', rulesError(DEFAULT_RULES), null)
cek('jam/hari 0 ditolak', rulesError({ ...DEFAULT_RULES, hoursPerDay: 0 }) !== null, true)
cek('ambang tidak menurun ditolak', rulesError({ ...DEFAULT_RULES, dailyThresholds: [7, 8, 6] }) !== null, true)
cek('ambang negatif ditolak', rulesError({ ...DEFAULT_RULES, weeklyThresholds: [40, 35, -1] }) !== null, true)
cek('ambang NaN ditolak', rulesError({ ...DEFAULT_RULES, monthlyPerDay: [8, Number.NaN, 6] }) !== null, true)

// Rekap
const log = (d: string, p: string, c: string, m: number): LogRow => ({ user_id: 'u', work_date: d, project_name: p, category: c, duration_minutes: m })
const logs = [
  log('2026-11-02', 'Klien A', 'Focus Work', 240),
  log('2026-11-02', 'Klien A', 'Meeting', 60),
  log('2026-11-03', 'Manajemen Perusahaan', 'Administrasi', 180),
]
cek('breakdown proyek', breakdown(logs, 'project_name'), [
  { key: 'Klien A', hours: 5, count: 2, percent: 62.5 },
  { key: 'Manajemen Perusahaan', hours: 3, count: 1, percent: 37.5 },
])
cek('breakdown kosong', breakdown([], 'category'), [])
const s = monthlySummary(logs, 20)
cek('summary total', s.totalHours, 8)
cek('summary target', s.targetHours, 160)
cek('summary efektivitas', s.effectiveness, 5)
cek('summary aktivitas', s.activities, 3)
cek('summary hari aktif', s.activeDays, 2)
cek('summary rata/hari', s.avgHoursPerActiveDay, 4)
cek('summary rata/aktivitas', s.avgHoursPerActivity, 2.67)
cek('summary status', s.status, 'KURANG')
const kunci = monthlySummary([log('2026-11-02', 'X', 'Focus Work', 150 * 60)], 21, undefined, 150)
cek('target dikunci', kunci.targetHours, 150)
cek('status ikut target dikunci', kunci.status, 'SESUAI')
cek('summary bulan tanpa hari kerja', monthlySummary([], 0).effectiveness, 0)

console.log(`hr-tracker: ${ok} lulus, ${gagal} gagal`)
if (gagal) process.exit(1)
