/**
 * Batas panjang isian teks, dipakai server action (audit B12, 8 Nov 2026).
 *
 * Sebelumnya batas hanya `maxLength` di UI; request yang dikirim langsung
 * bisa menyimpan teks sepanjang apa pun. Nilai di sini = batas terbesar yang
 * dipakai UI untuk nama field yang sama, jadi isian sah dari form tidak
 * pernah ditolak.
 */
export const FIELD_MAX: Record<string, number> = {
  title: 300,
  name: 150,
  client: 150,
  full_name: 120,
  email: 254,
  external_name: 120,
  external_email: 254,
  location: 200,
  meeting_link: 2000,
  evidence_url: 2000,
  decision: 500,
  rationale: 1000,
  review_note: 2000,
  description: 5000,
  notes: 20000,
}

/** Field lain (id, status, tanggal, dll.) jauh lebih pendek; ini jaring pengaman. */
export const DEFAULT_FIELD_MAX = 500

export function fieldMax(name: string): number {
  return FIELD_MAX[name] ?? DEFAULT_FIELD_MAX
}

export class FieldTooLongError extends Error {
  constructor(field: string) {
    super(`Field "${field}" is too long.`)
    this.name = 'FieldTooLongError'
  }
}

/**
 * Baca field teks (trim). Melempar bila melebihi batas: hanya terjadi bila
 * `maxLength` di UI dilewati (request buatan), jadi tidak perlu pesan ramah.
 */
export function readLimitedField(formData: FormData, name: string): string {
  const value = formData.get(name)
  if (typeof value !== 'string') return ''
  // Browser mengirim baris baru sebagai \r\n, padahal maxLength di UI
  // menghitungnya satu karakter: samakan dulu supaya isian sah tidak ditolak.
  const trimmed = value.replace(/\r\n/g, '\n').trim()
  if (trimmed.length > fieldMax(name)) throw new FieldTooLongError(name)
  return trimmed
}
