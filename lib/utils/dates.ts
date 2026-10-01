export function formatDate(value: string | null): string {
  if (!value) return '-'
  return new Date(value).toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

/** Hari ini dalam format YYYY-MM-DD untuk perbandingan deadline. */
export function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

export function isOverdue(deadline: string | null, status: string): boolean {
  if (!deadline || status === 'DONE') return false
  return deadline < todayISO()
}
