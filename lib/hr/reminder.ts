/** Pengingat Daily Tracker (HR Tahap 1). Murni supaya bisa dites. */

export type ReminderUser = { id: string; status: string; is_developer: boolean | null; deleted_at: string | null }

/**
 * Siapa yang diingatkan hari ini: hanya di hari kerja (bukan libur kalender),
 * user aktif yang belum mencatat satu aktivitas pun hari itu. Akun Developer
 * (bukan akun kerja harian) dan akun terhapus dilewati.
 * shortcut: cuti/izin/sakit belum dikecualikan; tambahkan saat Tahap 2 (leave_requests).
 */
export function usersToRemind(users: ReminderUser[], loggedUserIds: Set<string>, isWorkday: boolean): string[] {
  if (!isWorkday) return []
  return users
    .filter((u) => u.status === 'ACTIVE' && !u.is_developer && !u.deleted_at && !loggedUserIds.has(u.id))
    .map((u) => u.id)
}

/** Saklar fitur: mati kecuali env TRACKER_REMINDER_ENABLED = 'true' (aturan uji nyata dulu). */
export const reminderEnabled = (value: string | undefined) => value === 'true'
