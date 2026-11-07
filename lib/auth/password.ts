/**
 * Aturan password — modul murni, tanpa dependency.
 *
 * Dua konteks berbeda:
 * 1. Admin membuat user langsung → admin mengetik password awal.
 *    Minimal 6 karakter agar selaras dengan batas minimum Supabase Auth
 *    (dashboard tidak mengizinkan < 6). Password awal dibagikan lewat
 *    kanal aman; user bisa diminta ganti saat login pertama.
 * 2. User mengganti password sendiri (/change-password) → minimal 8
 *    karakter, sama seperti aturan di /accept-invite.
 */

export const MIN_ADMIN_PASSWORD_LENGTH = 6
export const MIN_SELF_PASSWORD_LENGTH = 8

/** Password awal yang diketik admin. */
export function validateAdminPassword(password: string): string | null {
  if (!password) return 'Password is required.'
  if (password.length < MIN_ADMIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_ADMIN_PASSWORD_LENGTH} characters.`
  }
  return null
}

/** Password baru yang dipilih user sendiri (change-password). */
export function validateSelfPassword(
  password: string,
  confirm: string
): string | null {
  if (!password) return 'Password is required.'
  if (password.length < MIN_SELF_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_SELF_PASSWORD_LENGTH} characters.`
  }
  if (password !== confirm) return 'Passwords do not match.'
  return null
}
