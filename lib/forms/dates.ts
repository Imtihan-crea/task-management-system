/**
 * Tanggal kalender `YYYY-MM-DD` yang benar-benar ada (audit C1, 8 Nov 2026).
 *
 * `Date.parse` menerima "2026-02-30" (digeser ke 2 Maret) dan "abc 2026",
 * lalu database menolak dengan pesan generik. Kosong = valid (field opsional).
 */
export function isValidDateInput(value: string): boolean {
  if (!value) return true
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!m) return false
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const date = new Date(Date.UTC(y, mo - 1, d))
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d
}
