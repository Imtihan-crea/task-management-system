/**
 * Uji boundary workflow submit task (7 Okt 2026):
 * CANCELLED + tanggal submit + label overdue historis.
 * Jalankan: npm run test:task
 */
import { daysFromTodayISO, formatDateTime, isOverdue, showsOverdueBadge, todayISO } from '../lib/utils/dates'
import { todayInAppTime } from '../lib/utils/meeting-time'

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

const PAST = '2000-01-01'
const FUTURE = '2999-12-31'

/* ---------- isOverdue: operasional (tab, KPI, scheduler) ---------- */
cek('TODO lewat deadline = overdue', isOverdue(PAST, 'TODO'), true)
cek('IN_PROGRESS lewat deadline = overdue', isOverdue(PAST, 'IN_PROGRESS'), true)
cek('BLOCKED lewat deadline = overdue', isOverdue(PAST, 'BLOCKED'), true)
cek('DONE lewat deadline = BUKAN overdue', isOverdue(PAST, 'DONE'), false)
cek('CANCELLED lewat deadline = BUKAN overdue', isOverdue(PAST, 'CANCELLED'), false)
cek('TODO belum deadline = bukan', isOverdue(FUTURE, 'TODO'), false)
cek('deadline null = bukan', isOverdue(null, 'TODO'), false)

/* ---------- showsOverdueBadge: label historis ---------- */
cek('terbuka + lewat = label', showsOverdueBadge(PAST, 'TODO', null, null), true)
cek('terbuka + belum = tanpa label', showsOverdueBadge(FUTURE, 'TODO', null, null), false)
// DONE terlambat submit -> label tetap
cek(
  'DONE telat (deadline < submitted) = label',
  showsOverdueBadge('2026-10-01', 'DONE', '2026-10-05T10:00:00+00:00', null),
  true
)
// DONE tepat waktu -> TANPA label walau hari ini sudah lewat deadline
cek(
  'DONE tepat waktu = tanpa label',
  showsOverdueBadge('2026-10-10', 'DONE', '2026-10-05T10:00:00+00:00', null),
  false
)
// DONE sehari setelah deadline -> label
cek(
  'DONE H+1 = label',
  showsOverdueBadge('2026-10-04', 'DONE', '2026-10-05T10:00:00+00:00', null),
  true
)
// CANCELLED sebelum deadline -> tanpa label
cek(
  'CANCELLED sebelum deadline = tanpa label',
  showsOverdueBadge('2026-12-31', 'CANCELLED', null, '2026-10-05T10:00:00+00:00'),
  false
)
// CANCELLED setelah deadline -> label
cek(
  'CANCELLED setelah deadline = label',
  showsOverdueBadge('2026-10-01', 'CANCELLED', null, '2026-10-05T10:00:00+00:00'),
  true
)
// Data lama tanpa tanggal submit -> fallback hari ini
cek(
  'DONE lama tanpa completed_at + deadline lampau = label',
  showsOverdueBadge(PAST, 'DONE', null, null),
  true
)
cek('deadline null = tanpa label', showsOverdueBadge(null, 'DONE', '2026-10-05T10:00:00+00:00', null), false)

/* ---------- C14: tanggal WIB, bukan UTC ---------- */
cek('todayISO = tanggal WIB', todayISO(), todayInAppTime())
cek('daysFromTodayISO(0) = hari ini', daysFromTodayISO(0), todayISO())
cek('daysFromTodayISO(7) > hari ini', daysFromTodayISO(7) > todayISO(), true)
// 1 Okt 18:00 UTC = 2 Okt 01:00 WIB: submit sesudah hari deadline -> label
cek(
  'DONE submit lewat tengah malam WIB = label',
  showsOverdueBadge('2026-10-01', 'DONE', '2026-10-01T18:00:00+00:00', null),
  true
)
// 1 Okt 16:00 UTC = 1 Okt 23:00 WIB: masih hari deadline -> tanpa label
cek(
  'DONE submit 23:00 WIB hari deadline = tanpa label',
  showsOverdueBadge('2026-10-01', 'DONE', '2026-10-01T16:00:00+00:00', null),
  false
)

/* ---------- formatDateTime ---------- */
cek('format null', formatDateTime(null), '-')
cek('format invalid', formatDateTime('bukan-tanggal'), '-')
const dt = formatDateTime('2026-10-06T14:30:00+07:00')
cek('memuat tanggal', dt.includes('Okt 2026'), true)

console.log(`LULUS: ${ok}`)
console.log(`GAGAL: ${gagal}`)
if (gagal > 0) process.exit(1)