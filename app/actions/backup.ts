'use server'

import { requireProfile } from '@/lib/auth/session'
import { loadAccess } from '@/lib/auth/current-access'
import { isTopLevel } from '@/lib/auth/access'
import { runBackup } from '@/lib/backup/run'

export type BackupNowState = { error?: string; success?: string } | undefined

/** Tombol "Kirim backup sekarang" (Pengaturan). Hanya Super Admin/Developer. */
export async function sendBackupNow(): Promise<BackupNowState> {
  const profile = await requireProfile()
  if (!isTopLevel(await loadAccess(profile.id))) return { error: 'Hanya Super Admin atau Developer.' }
  const result = await runBackup(profile.id)
  if (!result.ok) return { error: result.error }
  return { success: `Backup terkirim (${result.rows} baris, ${Math.ceil(result.bytes / 1024)} KB). Cek kotak masuk penerima backup.` }
}
