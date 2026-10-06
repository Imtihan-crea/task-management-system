export function formatDate(value: string | null): string {
  if (!value) return '-'
  return new Date(value).toLocaleDateString('id-ID', {
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
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
  const time = d.toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
  })
  return `${date}, ${time}`
}

/** Hari ini dalam format YYYY-MM-DD untuk perbandingan deadline. */
export function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
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
    const ref = (completedAt ?? '').slice(0, 10) || todayISO()
    return deadline < ref
  }
  if (status === 'CANCELLED') {
    const ref = (cancelledAt ?? '').slice(0, 10) || todayISO()
    return deadline < ref
  }
  return deadline < todayISO()
}
