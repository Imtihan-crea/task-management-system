import { APP_TIMEZONE, todayInAppTime } from './meeting-time'

// Server Vercel berzona UTC: tanpa timeZone, timestamp dekat tengah malam salah hari.
// Tanggal polos 'YYYY-MM-DD' (UTC 00:00 = 07:00 WIB) tetap hari yang sama.
export function formatDate(value: string | null): string {
  if (!value) return '-'
  return new Date(value).toLocaleDateString('id-ID', {
    timeZone: APP_TIMEZONE,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

/** Tanggal + jam: "06 Okt 2026, 14.30" (untuk Submitted/Canceled Date). */
export function formatDateTime(value: string | null): string {
  if (!value) return '-'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '-'
  const date = d.toLocaleDateString('id-ID', {
    timeZone: APP_TIMEZONE,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
  const time = d.toLocaleTimeString('id-ID', {
    timeZone: APP_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
  })
  return `${date}, ${time}`
}

/**
 * Hari ini (WIB) dalam format YYYY-MM-DD untuk perbandingan deadline.
 * Keputusan pemilik C14 (9 Nov 2026): overdue dihitung WIB, bukan UTC,
 * sama dengan digest dan meeting.
 */
export function todayISO(): string {
  return todayInAppTime()
}

/** Tanggal WIB `days` hari dari sekarang (mis. batas "7 hari ke depan"). */
export function daysFromTodayISO(days: number): string {
  return todayInAppTime(new Date(Date.now() + days * 86_400_000))
}

/** Tanggal WIB dari timestamp (submit/cancel), '' bila kosong atau tidak valid. */
export function appDateOf(ts: string | null): string {
  if (!ts) return ''
  const d = new Date(ts)
  return Number.isNaN(d.getTime()) ? '' : todayInAppTime(d)
}

/**
 * Operasional: apakah task ini overdue SEKARANG (7 Okt 2026: DONE/CANCELLED
 * tidak pernah overdue — dipakai tab Overdue, KPI, scheduler, workload).
 */
export function isOverdue(deadline: string | null, status: string): boolean {
  if (!deadline || status === 'DONE' || status === 'CANCELLED') return false
  return deadline < todayISO()
}

/**
 * Label historis: apakah badge Overdue tetap tampil di task ini.
 * - Task terbuka: deadline < hari ini.
 * - Task DONE: deadline < tanggal submit (bukan hari ini — supaya task yang
 *   selesai tepat waktu tidak ikut dicap overdue belakangan).
 * - Task CANCELED: deadline < tanggal cancel.
 * - Data lama tanpa tanggal submit: fallback deadline < hari ini.
 */
export function showsOverdueBadge(
  deadline: string | null,
  status: string,
  completedAt: string | null,
  cancelledAt: string | null
): boolean {
  if (!deadline) return false
  if (status === 'DONE') {
    const ref = appDateOf(completedAt) || todayISO()
    return deadline < ref
  }
  if (status === 'CANCELLED') {
    const ref = appDateOf(cancelledAt) || todayISO()
    return deadline < ref
  }
  return deadline < todayISO()
}
