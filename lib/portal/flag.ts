/**
 * Saklar Portal aplikasi (21 Nov 2026: konsep Portal belum disetujui pemilik).
 * Mati (bawaan): setelah login / logo / akses ditolak -> /dashboard, menu samping
 * lengkap per kelompok seperti sebelum Portal, /portal dialihkan ke /dashboard.
 * Nyala: NEXT_PUBLIC_PORTAL_ENABLED=true di env (dibaca saat build, juga di klien).
 */
export const PORTAL_ENABLED = process.env.NEXT_PUBLIC_PORTAL_ENABLED === 'true'

/** Halaman beranda sesudah login / klik logo. */
export const HOME_PATH = PORTAL_ENABLED ? '/portal' : '/dashboard'

/** Tujuan saat halaman ditolak karena izin. */
export const DENIED_PATH = `${HOME_PATH}?denied=1`
