/**
 * Aturan alamat resmi (7 Nov 2026).
 *
 * Satu-satunya alamat produksi yang boleh dipakai:
 *   https://kasuat-task.vercel.app
 *
 * Domain lama (`task-management-system-jatc…`) tetap hidup di Vercel setelah
 * project di-rename, dan URL preview per-deployment juga bisa diakses.
 * Supaya tidak ada dua alamat yang beredar, semua host lama diarahkan (308)
 * ke alamat resmi ini.
 */

export const CANONICAL_HOST = 'kasuat-task.vercel.app'
export const CANONICAL_ORIGIN = `https://${CANONICAL_HOST}`

/** Host lama yang harus dialihkan ke alamat resmi. */
const LEGACY_HOST_PREFIX = 'task-management-system-jatc'

/** Buang port dan spasi, lalu lowercase. */
export function normalizeHost(host: string | null | undefined): string {
  if (!host) return ''
  return host.split(':')[0].trim().toLowerCase()
}

/**
 * true untuk domain produksi lama DAN URL preview dari project lama,
 * mis. `task-management-system-jatc.vercel.app` dan
 * `task-management-system-jatc-iantteaa-1814.vercel.app`.
 */
export function isLegacyHost(host: string | null | undefined): boolean {
  const normalized = normalizeHost(host)
  if (!normalized) return false

  return (
    normalized === `${LEGACY_HOST_PREFIX}.vercel.app` ||
    normalized.startsWith(`${LEGACY_HOST_PREFIX}-`)
  )
}

/** Bangun URL absolut ke alamat resmi. */
export function canonicalUrl(pathname: string, search = ''): string {
  const path = pathname.startsWith('/') ? pathname : `/${pathname}`
  return `${CANONICAL_ORIGIN}${path}${search}`
}

/**
 * Hanya GET/HEAD yang dialihkan. Cron dari Supabase memakai POST ke
 * domain lama; kalau ikut dialihkan, pg_net tidak mengikuti redirect dan
 * pengingat deadline bisa berhenti.
 */
export function shouldRedirectMethod(method: string): boolean {
  const m = method.toUpperCase()
  return m === 'GET' || m === 'HEAD'
}
