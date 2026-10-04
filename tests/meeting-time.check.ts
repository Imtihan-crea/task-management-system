/**
 * Uji boundary lib/utils/meeting-time.ts (waktu lokal Asia/Jakarta).
 *
 * Jalankan: npm run test:time
 * Semua "sekarang" dibentuk dari Date UTC eksplisit, lalu dibandingkan dengan
 * hasil fungsi yang harus melihat waktu Asia/Jakarta.
 */
import {
  todayInAppTime,
  nowInAppTime,
  timeToMinutes,
  wallValue,
  nowWallValue,
  isMeetingToday,
  isMeetingUpcoming,
  isWithinReminderWindow,
  shiftDays,
  formatTimeRange,
  formatDuration,
  formatMeetingDate,
  formatRelativeDay,
  daysAgoLabel,
} from '../lib/utils/meeting-time'

let ok = 0
let gagal = 0

function cek(label: string, aktual: unknown, harap: unknown): void {
  const lulus = JSON.stringify(aktual) === JSON.stringify(harap)
  if (lulus) {
    ok++
  } else {
    gagal++
    console.log(`  [GAGAL] ${label} -> ${JSON.stringify(aktual)} (harus ${JSON.stringify(harap)})`)
  }
}

/* ---------- Kasus batas zona waktu ---------- */

// UTC 2026-10-04 22:30 = WIB 2026-10-05 05:30 (di Jakarta sudah besok!)
const u = new Date('2026-10-04T22:30:00Z')
cek('UTC 04 Oct 22:30 -> tanggal Jakarta 05 Oct', todayInAppTime(u), '2026-10-05')
cek('UTC 04 Oct 22:30 -> jam Jakarta 05', nowInAppTime(u).hour, 5)

// UTC 17:00 = WIB 00:00 (tepat tengah malam)
const tengahMalam = new Date('2026-10-04T17:00:00Z')
cek('tengah malam WIB -> tanggal maju', todayInAppTime(tengahMalam), '2026-10-05')
cek('tengah malam WIB -> jam 0 (bukan 24)', nowInAppTime(tengahMalam).hour, 0)

// UTC 16:59 = WIB 23:59 (masih hari sebelumnya)
const sebelumMalam = new Date('2026-10-04T16:59:00Z')
cek('23:59 WIB -> masih tanggal sebelumnya', todayInAppTime(sebelumMalam), '2026-10-04')
cek('23:59 WIB -> jam 23', nowInAppTime(sebelumMalam).hour, 23)

/* ---------- timeToMinutes ---------- */
cek('"09:00"', timeToMinutes('09:00'), 540)
cek('"09:00:00"', timeToMinutes('09:00:00'), 540)
cek('"9:00" tanpa nol', timeToMinutes('9:00'), 540)
cek('"23:59"', timeToMinutes('23:59'), 1439)
cek('"00:00"', timeToMinutes('00:00'), 0)
cek('null', timeToMinutes(null), null)
cek('teks acak', timeToMinutes('abc'), null)
cek('jam 25 ditolak', timeToMinutes('25:00'), null)
cek('menit 60 ditolak', timeToMinutes('10:60'), null)

/* ---------- wallValue monoton ---------- */
cek('09:00 > 08:59', wallValue('2026-10-10', '09:00')! > wallValue('2026-10-10', '08:59')!, true)
cek(
  '10 Okt 08:59 > 09 Okt 23:59',
  wallValue('2026-10-10', '08:59')! > wallValue('2026-10-09', '23:59')!,
  true
)
cek('tanggal tidak valid', wallValue('abc', '09:00'), null)

/* ---------- shiftDays ---------- */
cek('2026-10-10 +1', shiftDays('2026-10-10', 1), '2026-10-11')
cek('2026-10-31 +1 (ganti bulan)', shiftDays('2026-10-31', 1), '2026-11-01')
cek('2026-12-31 +1 (ganti tahun)', shiftDays('2026-12-31', 1), '2027-01-01')
cek('2026-03-01 -1 (tahun kabisat)', shiftDays('2026-03-01', -1), '2026-02-28')

/* ---------- Format ---------- */
cek('formatTimeRange', formatTimeRange('09:00', '10:30'), '09.00–10.30')
cek('formatDuration 90 menit', formatDuration('09:00', '10:30'), '1 jam 30 menit')
cek('formatDuration 60 menit', formatDuration('09:00', '10:00'), '1 jam')
cek('formatDuration 45 menit', formatDuration('09:00', '09:45'), '45 menit')
cek('formatDuration terbalik', formatDuration('10:00', '09:00'), '-')
cek('formatMeetingDate (2 digit)', formatMeetingDate('2026-10-07'), '07 Okt 2026')
cek('formatMeetingDate null', formatMeetingDate(null), '-')
cek('daysAgoLabel 2 hari', daysAgoLabel('2026-10-03', u), '2 hari lalu')
cek('daysAgoLabel hari ini', daysAgoLabel('2026-10-05', u), 'Hari ini')
cek('formatRelativeDay hari ini', formatRelativeDay('2026-10-05', u), 'Hari ini')
cek('formatRelativeDay besok', formatRelativeDay('2026-10-06', u), 'Besok')
cek('formatRelativeDay kemarin', formatRelativeDay('2026-10-04', u), 'Kemarin')

/* ---------- Definisi tab (§7) ---------- */
cek('meeting hari ini', isMeetingToday({ meeting_date: '2026-10-05' }, u), true)
cek('meeting besok bukan today', isMeetingToday({ meeting_date: '2026-10-06' }, u), false)
cek(
  'upcoming: besok SCHEDULED',
  isMeetingUpcoming({ meeting_date: '2026-10-06', start_time: '09:00', status: 'SCHEDULED' }, u),
  true
)
cek(
  'upcoming: hari ini 05:00 sudah lewat',
  isMeetingUpcoming({ meeting_date: '2026-10-05', start_time: '05:00', status: 'SCHEDULED' }, u),
  false
)
cek(
  'upcoming: CANCELLED bukan upcoming',
  isMeetingUpcoming({ meeting_date: '2026-10-06', start_time: '09:00', status: 'CANCELLED' }, u),
  false
)
cek(
  'upcoming: DRAFT masih upcoming (PRD §7)',
  isMeetingUpcoming({ meeting_date: '2026-10-06', start_time: '09:00', status: 'DRAFT' }, u),
  true
)

/* ---------- Reminder 15 menit (§31) ---------- */
// "sekarang" = 2026-10-05 05:30 WIB, jendela [05:30, 05:45)
const mk = (time: string, status = 'SCHEDULED') => ({
  meeting_date: '2026-10-05',
  start_time: time,
  status,
})
cek('05:35 dalam jendela', isWithinReminderWindow(mk('05:35'), 15, u), true)
cek('05:44 dalam jendela', isWithinReminderWindow(mk('05:44'), 15, u), true)
cek('05:30 tepat batas bawah -> masuk', isWithinReminderWindow(mk('05:30'), 15, u), true)
cek('05:45 batas atas -> TERTUTUP', isWithinReminderWindow(mk('05:45'), 15, u), false)
cek('05:29 sebelum jendela', isWithinReminderWindow(mk('05:29'), 15, u), false)
cek('DRAFT tidak dapat reminder', isWithinReminderWindow(mk('05:35', 'DRAFT'), 15, u), false)
cek('COMPLETED tidak dapat reminder', isWithinReminderWindow(mk('05:35', 'COMPLETED'), 15, u), false)
cek('CANCELLED tidak dapat reminder', isWithinReminderWindow(mk('05:35', 'CANCELLED'), 15, u), false)

/* ---------- Sanity nowWallValue ---------- */
cek('nowWallValue positif', nowWallValue(u) > 0, true)
cek(
  'nowWallValue jatuh di hari yang benar',
  Math.floor(nowWallValue(u) / 1440),
  Date.UTC(2026, 9, 5) / 86_400_000
)

console.log(`LULUS: ${ok}`)
console.log(`GAGAL: ${gagal}`)
if (gagal > 0) process.exit(1)