import { escapeEmailHtml as h } from '@/lib/email/layout'

export type ErrorAlertInput = {
  error: unknown
  path: string
  method: string
  routePath: string
  routeType: string
  now: Date
}

/**
 * Bentuk email peringatan error server. Murni (tanpa I/O) supaya bisa dites.
 * Key dedupe = tanggal WIB: maksimal 1 email alert per hari untuk semua error
 * (keputusan pemilik 2026-11-08, menjaga kuota Brevo untuk email aplikasi).
 * Header request (cookie, token) sengaja TIDAK disertakan.
 */
export function buildErrorAlert(input: ErrorAlertInput) {
  const err = input.error
  const message = (err instanceof Error ? err.message : String(err)).slice(0, 500)
  const digest =
    typeof err === 'object' && err !== null && 'digest' in err ? String(err.digest) : ''
  // Tanggal WIB (UTC+7, tanpa DST).
  const dayWib = new Date(input.now.getTime() + 7 * 3600_000).toISOString().slice(0, 10)

  return {
    key: `server-error:${dayWib}`,
    subject: `[ERROR] ${input.method} ${input.routePath}`,
    html:
      '<p>Terjadi error di server aplikasi Task Management.</p><ul>' +
      `<li><strong>Waktu (UTC):</strong> ${h(input.now.toISOString())}</li>` +
      `<li><strong>Request:</strong> ${h(input.method)} ${h(input.path)}</li>` +
      `<li><strong>Route:</strong> ${h(input.routePath)} (${h(input.routeType)})</li>` +
      `<li><strong>Pesan:</strong> ${h(message)}</li>` +
      (digest ? `<li><strong>Digest:</strong> ${h(digest)}</li>` : '') +
      '</ul><p>Detail lengkap: log Vercel (cari digest/waktu di atas). ' +
      'Ini error pertama hari ini; error berikutnya hari ini (WIB) tidak dikirim lewat email.</p>',
  }
}
