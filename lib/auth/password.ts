/**
 * Aturan password (3 Nov 2026) — modul murni, tanpa dependency.
 *
 * Dua konteks berbeda:
 * 1. Admin membuat user langsung → admin yang mengetik password awal.
 *    Owner meminta minimal 4 karakter (password sementara, dibagikan
 *    lewat kanal aman, user bisa ganti sendiri).
 * 2. User mengganti password sendiri (/change-password) → minimal 8
 *    karakter, sama seperti aturan di /accept-invite sejak Phase 3.
 */

export const MIN_ADMIN_PASSWORD_LENGTH = 4
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
