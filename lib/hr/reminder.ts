/** Pengingat Daily Tracker (HR Tahap 1). Murni supaya bisa dites. */

export type ReminderUser = {
  id: string
  status: string
  is_developer: boolean | null
  deleted_at: string | null
  tracker_required: boolean | null
}

/**
 * Siapa yang diingatkan hari ini: hanya di hari kerja (bukan libur kalender),
 * user aktif yang wajib isi tracker dan belum mencatat satu aktivitas pun hari itu. Akun Developer
 * (bukan akun kerja harian) dan akun terhapus dilewati.
 * shortcut: cuti/izin/sakit belum dikecualikan; tambahkan saat Tahap 2 (leave_requests).
 */
export function usersToRemind(
  users: ReminderUser[],
  loggedUserIds: Set<string>,
  isWorkday: boolean,
  only: Set<string> | null = null
): string[] {
  if (!isWorkday) return []
  return users
    .filter((u) => u.status === 'ACTIVE' && !u.deleted_at && !loggedUserIds.has(u.id))
    // Mode uji: akun yang ditunjuk ikut walau akun Developer (akun untuk mencoba semua fitur).
    // Tanpa mode uji: hanya yang wajib isi tracker (keputusan pemilik 16 Nov 2026), bukan akun Developer.
    .filter((u) => (only ? only.has(u.id) : !u.is_developer && u.tracker_required === true))
    .map((u) => u.id)
}

/**
 * Mode uji: env TRACKER_REMINDER_ONLY = daftar id user (dipisah koma). Terisi =
 * hanya user itu yang diingatkan; kosong = semua. Id yang bukan UUID diabaikan;
 * bila terisi tetapi tidak ada id sah, tidak ada yang diingatkan (aman).
 */
export function pilotUsers(value: string | undefined): Set<string> | null {
  if (!value?.trim()) return null
  return new Set(value.split(',').map((v) => v.trim()).filter((v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)))
}

/** Saklar fitur: mati kecuali env TRACKER_REMINDER_ENABLED = 'true' (aturan uji nyata dulu). */
export const reminderEnabled = (value: string | undefined) => value === 'true'
