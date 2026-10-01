import 'server-only'

/**
 * URL dasar aplikasi untuk link undangan.
 *
 * PENTING: kita TIDAK menebak dari host request. Kalau begitu,
 * setiap link undangan yang dibuat dari Preview Deployment akan
 * mengarah ke domain preview yang tidak terdaftar di Supabase.
 *
 * Domain preview berubah setiap deploy, jadi satu-satunya sumber
 * yang stabil adalah env var.
 */
export function getAppBaseUrl(): string {
  const raw = process.env.APP_URL?.trim()

  if (!raw) {
    throw new Error(
      'APP_URL is not configured. Set APP_URL in the deployment platform (Production AND Preview).'
    )
  }

  return raw.replace(/\/+$/, '')
}
