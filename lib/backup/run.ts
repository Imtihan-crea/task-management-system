import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmail } from '@/lib/email/notify'
import { isPlaceholderEmail } from '@/lib/email/placeholder'
import { logActivity } from '@/lib/activity-log/service'
import { todayISO } from '@/lib/utils/dates'
import {
  backupEmailHtml,
  backupFileName,
  backupSubject,
  checkPassphrase,
  collectBackup,
  encryptBackup,
  oversizeEmailHtml,
  parseRecipients,
  tooLarge,
  totalRows,
  type BackupData,
} from '@/lib/backup/backup'

export type BackupResult = { ok: true; rows: number; bytes: number } | { ok: false; error: string }

/**
 * Buat backup terenkripsi lalu kirim ke BACKUP_EMAIL_TO. Dipakai cron
 * (actorUserId null = Sistem) dan tombol di Pengaturan. Hasil selalu dicatat
 * ke activity_logs (BACKUP_SENT / BACKUP_FAILED) tanpa alamat atau isi data.
 */
export async function runBackup(actorUserId: string | null): Promise<BackupResult> {
  const started = Date.now()
  const date = todayISO()
  const trigger = actorUserId ? 'manual' : 'cron'

  async function fail(reason: string, error: string): Promise<BackupResult> {
    console.error(`[backup] gagal (${reason}): ${error}`)
    await logActivity({
      actorUserId,
      action: 'BACKUP_FAILED',
      entityType: 'backup',
      entityId: date,
      metadata: { reason, trigger, duration_ms: Date.now() - started },
    })
    return { ok: false, error }
  }

  const passphraseError = checkPassphrase(process.env.BACKUP_PASSPHRASE)
  if (passphraseError) return fail('config', passphraseError)
  const to = parseRecipients(process.env.BACKUP_EMAIL_TO).filter((e) => !isPlaceholderEmail(e)).map((email) => ({ email }))
  if (to.length === 0) return fail('config', 'BACKUP_EMAIL_TO belum diisi.')

  let file: string
  let meta: BackupData['meta']
  try {
    const data = await collectBackup(createAdminClient(), process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'lokal', process.env)
    meta = data.meta
    file = encryptBackup(data, process.env.BACKUP_PASSPHRASE!)
  } catch (error) {
    console.error('[backup] read/encrypt:', (error as Error).message)
    return fail('read', 'Gagal membaca database.')
  }

  const bytes = Buffer.byteLength(file)
  if (tooLarge(bytes)) {
    await sendEmail({ to, subject: `[Backup TMS GAGAL] ${date}: berkas terlalu besar`, html: oversizeEmailHtml(bytes) })
    return fail('too_large', `Berkas backup ${Math.ceil(bytes / 1024)} KB melebihi batas lampiran.`)
  }

  const fileName = backupFileName(date)
  const sent = await sendEmail({
    to,
    subject: backupSubject(date, meta, bytes),
    html: backupEmailHtml(meta, fileName),
    attachment: [{ name: fileName, content: Buffer.from(file).toString('base64') }],
  })
  if (!sent) return fail('email', 'Email backup ditolak atau gagal dikirim.')

  const rows = totalRows(meta)
  await logActivity({
    actorUserId,
    action: 'BACKUP_SENT',
    entityType: 'backup',
    entityId: date,
    metadata: { trigger, rows, size_kb: Math.ceil(bytes / 1024), recipients: to.length, duration_ms: Date.now() - started },
  })
  return { ok: true, rows, bytes }
}
