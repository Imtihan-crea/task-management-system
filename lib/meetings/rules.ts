/**
 * ============================================================================
 * ATURAN MEETING YANG MURNI (Phase 11)
 * ============================================================================
 *
 * Dipisahkan dari lib/data/meetings.ts dengan sengaja:
 * - Modul ini TIDAK memakai `server-only` dan TIDAK menyentuh database,
 *   jadi bisa diuji tanpa koneksi dan bisa dipakai dari mana saja.
 * - Definisi "meeting mana yang terlihat" dan "meeting masuk tab apa"
 *   adalah aturan bisnis. Kalau ia hidup di lapisan data, aturan bisnis
 *   ikut tercampur dengan query dan sulit diuji.
 *
 * Ini pola yang sama seperti `lib/data/user-options.ts` yang dulu dipisah
 * supaya tipe bisa dipakai client component.
 */

import type { MeetingScope } from '@/lib/data/meetings-types'
import { isMeetingToday, isMeetingUpcoming } from '@/lib/utils/meeting-time'
import { needsNotes, type MeetingTabKey } from '@/types/meeting'

const EMPTY_UUID = '00000000-0000-0000-0000-000000000000'

/**
 * Rakit filter PostgREST untuk membatasi hasil ke scope user.
 *
 * PENTING: nilai yang dikembalikan adalah ISI parameter `or`, BUKAN
 * `or=(...)` lengkap — pembungkusan `or=(...)` dilakukan oleh sdk saat
 * kita memanggil `query.or(nilai)`. Kalau ikut menulis `or=(...)` di sini,
 * hasilnya jadi `or=(or=(...))` dan filter gagal diam-diam.
 *
 * Mengembalikan null = tidak perlu pembatasan (hanya ADMIN).
 *
 * Catatan keamanan: kalau user tidak punya akses apa pun, fungsi ini
 * TETAP mengembalikan filter yang menghasilkan 0 baris. Jangan pernah
 * devolvulkan tanpa filter — itu yang akan membocorkan seluruh meeting
 * ke user yang tidak berhak.
 */
export function scopeFilter(scope: MeetingScope): string | null {
  // managedProjectIds === null hanya untuk ADMIN.
  if (scope.managedProjectIds === null) return null

  const clauses: string[] = []

  // Meeting project yang dikelola PM.
  if (scope.managedProjectIds.length > 0) {
    clauses.push(`project_id.in.(${scope.managedProjectIds.join(',')})`)
  }

  // Meeting yang dibuat / diorganize / diikuti user ini.
  if (scope.involvedMeetingIds.length > 0) {
    clauses.push(`id.in.(${scope.involvedMeetingIds.join(',')})`)
  }

  if (clauses.length === 0) return `id.eq.${EMPTY_UUID}`

  return clauses.join(',')
}

/** Baris meeting secukupnya untuk aturan tab. */
export type TabCandidate = {
  status: string
  meeting_date: string
  start_time: string
  notes: string | null
}

/**
 * Definisi tab PRD §7 — SATU-SATUNYA tempat filter tab diterapkan.
 *
 * Sengaja dihitung di JS, bukan di SQL:
 * - Definisi "Upcoming" butuh perbandingan tanggal + jam LOKAL (bukan UTC),
 *   dan PostgREST tidak bisa menulis (A AND B) OR (C AND D) dalam satu `or=`.
 * - `.or()` di supabase-js hanya boleh dipakai SEKALI per query (panggilan
 *   kedua menimpa yang pertama). Kalau tab ikut memakai `.or()`, filter scope
 *   bisa bocor — itu risiko keamanan, bukan sekadar performa.
 * - Definisinya sudah ada sebagai fungsi murni di lib/utils/meeting-time.ts dan
 *   types/meeting.ts; di sini kita memakai ulang, jadi tidak ada definisi
 *   ganda yang bisa berbeda.
 *
 * Volume meeting di aplikasi internal ini kecil (limit 500), jadi biaya
 * filter di memori ini tidak terasa. Index parsial `meetings_needs_notes_idx`
 * tetap berguna — dipakai scheduler (bucket 11) yang memang filter di SQL.
 */
export function matchesMeetingTab(
  row: TabCandidate,
  tab: MeetingTabKey,
  now: Date = new Date()
): boolean {
  if (tab === 'all') return true
  if (tab === 'today') return isMeetingToday(row, now)
  if (tab === 'upcoming') return isMeetingUpcoming(row, now)
  if (tab === 'completed') return row.status === 'COMPLETED'
  if (tab === 'needs_notes') return needsNotes(row)
  return true
}