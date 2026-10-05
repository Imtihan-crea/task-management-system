/**
 * Waktu lokal untuk Meeting (Phase 11).
 *
 * ==============================================================
 * KENAPA FILE INI ADA — DAN KENAPA dates.ts TIDAK DISENTUH
 * ==============================================================
 * `lib/utils/dates.ts` memakai UTC:
 *     todayISO() = new Date().toISOString().slice(0, 10)
 *
 * Itu WAJIB untuk task: deadline task sudah berjalan di production
 * memakai definisi UTC itu (PRD Fase 3–9). Mengubahnya akan ikut
 * mengubah kapan task dianggap overdue — itu regresi yang dilarang
 * PRD §47.
 *
 * Meeting berbeda: user Human membayangkan "jam 9 pagi" dalam
 * waktu lokal (Asia/Jakarta = UTC+7), dan reminder "15 menit
 * sebelum" hanya benar kalau dibandingkan dalam waktu lokal.
 * Kalau dibandingkan dalam UTC, reminder meeting jam 09:00 WIB
 * akan meletus 2 jam lebih awal (00:00 UTC).
 *
 * Jadi: `dates.ts` untuk task (UTC, tidak berubah),
 *       file ini untuk meeting (Asia/Jakarta).
 *
 * ==============================================================
 * KENAPA TIDAK PAKAI Math/Date UNTUK PERBANDINGAN
 * ==============================================================
 * Semua kebutuhan kita cuma perbandingan wall-clock:
 * "apakah meeting hari ini?", "apakah 15 menit lagi?",
 * "apakah sudah lewat 24 jam?".
 *
 * Jadi seluruh perbandingan dilakukan di ruang wall-clock
 * (tanggal + menit sejak tengah malam), tanpa konversi ke
 * instant absolut. Keuntungannya:
 * - tidak ada bug zona waktu / DST di tengah malam;
 * - tidak perlu tahu offset UTC saat itu;
 * - hasilnya identik di server mana pun, di zona waktu mana pun.
 *
 * Nilai `wallValue` bersifat monoton: 2026-10-10 09:00 > 2026-10-10
 * 08:59 > 2026-10-09 23:59.
 */

/** Timezone aplikasi untuk Meeting. Default Asia/Jakarta (WIB, UTC+7, tanpa DST). */
export const APP_TIMEZONE = process.env.APP_TIMEZONE ?? 'Asia/Jakarta'

const MINUTES_PER_DAY = 1440

export type AppTimeParts = {
  /** YYYY-MM-DD di timezone aplikasi */
  date: string
  /** 0–1439, menit sejak tengah malam */
  minutes: number
  hour: number
  minute: number
}

function partsIn(timeZone: string, now: Date): AppTimeParts {
  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
  // "2026-10-04, 15:30" -> ['2026-10-04', '15:30']
  const [datePart, timePart] = dtf.format(now).split(',').map((s) => s.trim())
  const [hour, minute] = timePart.split(':').map(Number)
  return {
    date: datePart,
    minutes: hour * 60 + minute,
    hour,
    minute,
  }
}

/** Waktu sekarang di timezone aplikasi (Asia/Jakarta). */
export function nowInAppTime(now: Date = new Date()): AppTimeParts {
  return partsIn(APP_TIMEZONE, now)
}

/** Tanggal hari ini di timezone aplikasi: "2026-10-04" */
export function todayInAppTime(now: Date = new Date()): string {
  return partsIn(APP_TIMEZONE, now).date
}

/**
 * Ubah "HH:MM" atau "HH:MM:SS" menjadi menit sejak tengah malam.
 * Menimalkan polanya (mis. "9:00") supaya aman terhadap input manual.
 */
export function timeToMinutes(value: string | null | undefined): number | null {
  if (!value) return null
  const match = /^(\d{1,2}):(\d{2})/.exec(value.trim())
  if (!match) return null
  const hour = Number(match[1])
  const minute = Number(match[2])
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null
  if (hour > 23 || minute > 59) return null
  return hour * 60 + minute
}

/**
 * Nilai wall-clock yang bisa dibandingkan antar waktu.
 * Contoh: 2026-10-10 09:00 -> 29_702_400
 *
 * Dipakai untuk membandingkan "meeting kapan" vs "sekarang kapan"
 * tanpa pernah menyentuh Date absolut.
 */
export function wallValue(dateISO: string, timeISO: string | null | undefined): number | null {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec((dateISO ?? '').trim())
  if (!dateMatch) return null
  const minutes = timeToMinutes(timeISO)
  if (minutes === null) return null

  const [, y, m, d] = dateMatch
  const days = Date.UTC(Number(y), Number(m) - 1, Number(d)) / 86_400_000
  if (!Number.isFinite(days)) return null
  return Math.round(days) * MINUTES_PER_DAY + minutes
}

/** Nilai wall-clock untuk sekarang. */
export function nowWallValue(now: Date = new Date()): number {
  const p = partsIn(APP_TIMEZONE, now)
  return wallValue(p.date, `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`) ?? 0
}

/* ------------------------------------------------------------------ */
/* Definisi tab & filter (PRD §7, §31, §36)                            */
/* ------------------------------------------------------------------ */

/** Meeting hari ini (berdasarkan tanggal lokal, bukan UTC). */
export function isMeetingToday(
  meeting: { meeting_date: string },
  now: Date = new Date()
): boolean {
  return meeting.meeting_date === todayInAppTime(now)
}

/** §7 Upcoming: meeting_datetime > now AND status != CANCELLED */
export function isMeetingUpcoming(
  meeting: { meeting_date: string; start_time: string; status: string },
  now: Date = new Date()
): boolean {
  if (meeting.status === 'CANCELLED') return false
  const mv = wallValue(meeting.meeting_date, meeting.start_time)
  if (mv === null) return false
  return mv > nowWallValue(now)
}

/**
 * §31 Meeting Reminder: jatuh pada [now + offset, now + offset + window).
 *
 * Hanya berlaku untuk meeting SCHEDULED yang belum CANCELLED.
 * Batas atas tertutup supaya satu meeting tidak kena dua run berurutan;
 * digabung event_key per hari, hasilnya tepat 1 reminder per meeting.
 *
 * Contoh pemakaian scheduler (cron tiap 15 menit):
 * - offset 0, window 15  → reminder 0–15 menit sebelum (bisa terasa "tiba-tiba")
 * - offset 15, window 15 → reminder 15–30 menit sebelum, tepat 1 kali.
 *   Dipakai scheduler karena run tiap 15 menit men-tile waktu tanpa overlap:
 *   run jam T melayani meeting [T+15, T+30), run T+15 melayani [T+30, T+45).
 */
export function isWithinReminderWindow(
  meeting: { meeting_date: string; start_time: string; status: string },
  windowMinutes: number,
  now: Date = new Date(),
  offsetMinutes = 0
): boolean {
  if (meeting.status !== 'SCHEDULED') return false
  const mv = wallValue(meeting.meeting_date, meeting.start_time)
  if (mv === null) return false
  const current = nowWallValue(now)
  return mv >= current + offsetMinutes && mv < current + offsetMinutes + windowMinutes
}

/** Geser tanggal (format YYYY-MM-DD) sebanyak N hari. Aman di batas bulan/tahun. */
export function shiftDays(dateISO: string, delta: number): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((dateISO ?? '').trim())
  if (!m) return null
  const [, y, mo, d] = m.map(Number)
  const shifted = new Date(Date.UTC(y, mo - 1, d + delta))
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}-${String(
    shifted.getUTCDate()
  ).padStart(2, '0')}`
}

/* ------------------------------------------------------------------ */
/* Format tampilan                                                     */
/* ------------------------------------------------------------------ */

function displayTime(value: string | null | undefined): string {
  const minutes = timeToMinutes(value)
  if (minutes === null) return '-'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}.${String(m).padStart(2, '0')}`
}

/** "09.00" — format Indonesia, dipakai untuk tampil. */
export function formatMeetingTime(value: string | null | undefined): string {
  return displayTime(value)
}

/** "09.00–10.30" */
export function formatTimeRange(
  start: string | null | undefined,
  end: string | null | undefined
): string {
  return `${displayTime(start)}–${displayTime(end)}`
}

/** Durasi dalam menit. */
export function durationMinutes(
  start: string | null | undefined,
  end: string | null | undefined
): number | null {
  const s = timeToMinutes(start)
  const e = timeToMinutes(end)
  if (s === null || e === null) return null
  const diff = e - s
  return diff > 0 ? diff : null
}

/** "1 jam 30 menit" / "45 menit" / "-" */
export function formatDuration(
  start: string | null | undefined,
  end: string | null | undefined
): string {
  const diff = durationMinutes(start, end)
  if (diff === null) return '-'
  const hours = Math.floor(diff / 60)
  const minutes = diff % 60
  if (hours === 0) return `${minutes} menit`
  if (minutes === 0) return `${hours} jam`
  return `${hours} jam ${minutes} menit`
}

/**
 * Tanggal meeting dalam bahasa Indonesia: "07 Okt 2026".
 *
 * Sengaja TIDAK memakai `formatDate` dari dates.ts: itu memakai
 * `new Date('2026-10-07')` yang di-parse sebagai UTC midnight, lalu
 * diformat dengan timezone server. Hasilnya bisa bergeser satu hari
 * kalau server/browser berada di zona waktu berbeda. Di sini tanggal
 * diperlakukan sebagai string murni — tidak ada konversi sama sekali.
 */
const MONTHS_ID = [
  'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
  'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des',
]

export function formatMeetingDate(dateISO: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((dateISO ?? '').trim())
  if (!m) return '-'
  const [, y, mo, d] = m
  const month = MONTHS_ID[Number(mo) - 1]
  if (!month) return '-'
  return `${d} ${month} ${y}`
}

/** "Hari ini" / "Besok" / "Kemarin" / format tanggal biasa. */
export function formatRelativeDay(
  dateISO: string | null | undefined,
  now: Date = new Date()
): string {
  if (!dateISO) return '-'
  const current = nowInAppTime(now)
  if (dateISO === current.date) return 'Hari ini'
  if (dateISO === shiftDays(current.date, -1)) return 'Kemarin'
  if (dateISO === shiftDays(current.date, 1)) return 'Besok'
  return formatMeetingDate(dateISO)
}

/** Label relatif untuk Needs Notes queue (§36): "2 days ago". */
export function daysAgoLabel(dateISO: string, now: Date = new Date()): string {
  const [y, m, d] = dateISO.split('-').map(Number)
  const meetingDay = Date.UTC(y, m - 1, d) / 86_400_000
  const current = nowInAppTime(now)
  const [cy, cm, cd] = current.date.split('-').map(Number)
  const today = Date.UTC(cy, cm - 1, cd) / 86_400_000
  const diff = Math.round(today - meetingDay)
  if (diff <= 0) return 'Hari ini'
  if (diff === 1) return '1 hari lalu'
  if (diff < 30) return `${diff} hari lalu`
  return formatMeetingDate(dateISO)
}