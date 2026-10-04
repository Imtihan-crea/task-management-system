/**
 * Tipe scope Meeting, dipisah supaya `lib/meetings/rules.ts` (yang murni)
 * bisa mengimpornya tanpa menarik modul `server-only`.
 */

export type MeetingScope = {
  userId: string
  role: string
  /**
   * null = ADMIN (melihat semua meeting, tanpa filter).
   * Selain itu = daftar id project yang dikelola user (PM).
   */
  managedProjectIds: string[] | null
  /** Meeting yang terkait langsung: dibuat / diorganize / diikuti. */
  involvedMeetingIds: string[]
}