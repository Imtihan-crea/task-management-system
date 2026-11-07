import { createHash, timingSafeEqual } from 'node:crypto'

/**
 * Cek header `Authorization: Bearer <CRON_SECRET>` tanpa bocor lewat waktu.
 * Kedua sisi di-hash dulu supaya panjangnya selalu sama (syarat
 * timingSafeEqual) dan panjang secret juga tidak bocor.
 * Secret kosong selalu ditolak; route tetap membalas 500 untuk kasus itu.
 */
export function isCronAuthorized(header: string | null, secret: string | undefined): boolean {
  if (!secret || !header) return false
  const digest = (value: string) => createHash('sha256').update(value).digest()
  return timingSafeEqual(digest(header), digest(`Bearer ${secret}`))
}
