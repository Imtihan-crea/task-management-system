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
 * Key dedupe = jenis error + jam (UTC): maksimal 1 email per jenis error per jam.
 * Header request (cookie, token) sengaja TIDAK disertakan.
 */
export function buildErrorAlert(input: ErrorAlertInput) {
  const err = input.error
  const message = (err instanceof Error ? err.message : String(err)).slice(0, 500)
  const digest =
    typeof err === 'object' && err !== null && 'digest' in err ? String(err.digest) : ''
  const kind = digest || `${input.routePath}:${message.slice(0, 80)}`
  const hour = input.now.toISOString().slice(0, 13)

  return {
    key: `server-error:${kind}:${hour}`,
    subject: `[ERROR] ${input.method} ${input.routePath}`,
    html:
      '<p>Terjadi error di server aplikasi Task Management.</p><ul>' +
      `<li><strong>Waktu (UTC):</strong> ${h(input.now.toISOString())}</li>` +
      `<li><strong>Request:</strong> ${h(input.method)} ${h(input.path)}</li>` +
      `<li><strong>Route:</strong> ${h(input.routePath)} (${h(input.routeType)})</li>` +
      `<li><strong>Pesan:</strong> ${h(message)}</li>` +
      (digest ? `<li><strong>Digest:</strong> ${h(digest)}</li>` : '') +
      '</ul><p>Detail lengkap: log Vercel (cari digest/waktu di atas) atau Sentry bila aktif. ' +
      'Error sejenis dalam jam yang sama tidak dikirim ulang.</p>',
  }
}
