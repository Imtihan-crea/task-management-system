/**
 * Backup harian lewat email (Supabase paket gratis tanpa backup otomatis).
 * Modul ini murni (tanpa `server-only`) supaya bisa diuji dan dijalankan
 * lokal; pengiriman email + activity log ada di lib/backup/run.ts.
 *
 * Format berkas (.tmsbak.txt, teks supaya lolos daftar ekstensi lampiran Brevo):
 *   baris 1  "TMSBAK1"
 *   sisanya  base64( salt[16] | iv[12] | tag[16] | AES-256-GCM(gzip(JSON)) )
 * Kunci = scrypt(BACKUP_PASSPHRASE, salt, N=2^15, r=8, p=1). Header + salt +
 * iv ikut diautentikasi (AAD). Dekripsi: scripts/backup/decrypt.mjs.
 */
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto'
import { gunzipSync, gzipSync } from 'node:zlib'
import type { SupabaseClient } from '@supabase/supabase-js'
import { allRows } from '@/lib/utils/paginate'
import { escapeEmailHtml as h } from '@/lib/email/layout'

/**
 * Semua tabel skema public, urut aman untuk dipulihkan (induk dulu), dengan
 * kolom primary key untuk urutan paginasi. tests/backup.check.ts gagal bila
 * ada `create table` baru di database/migrations yang belum masuk sini.
 */
export const BACKUP_TABLES: readonly (readonly [string, readonly string[]])[] = [
  ['profiles', ['id']],
  ['projects', ['id']],
  ['workstreams', ['id']],
  ['project_managers', ['project_id', 'user_id']],
  ['tasks', ['id']],
  ['task_suggestions', ['id']],
  ['notifications', ['id']],
  ['notification_events', ['event_key']],
  ['notification_preferences', ['user_id']],
  ['activity_logs', ['id']],
  ['meetings', ['id']],
  ['meeting_participants', ['id']],
  ['meeting_agendas', ['id']],
  ['meeting_decisions', ['id']],
  ['meeting_action_items', ['id']],
  ['app_migrations', ['version']],
  ['user_permissions', ['id']],
  ['hr_settings', ['id']],
  ['hr_month_targets', ['month']],
  ['work_calendar', ['day']],
  ['master_references', ['id']],
  ['work_logs', ['id']],
  ['work_log_comments', ['id']],
  ['leave_requests', ['id']],
  ['client_leads', ['id']],
  ['client_lead_events', ['id']],
]

export const AUTH_USERS_KEY = 'auth.users'
export const AUTH_IDENTITIES_KEY = 'auth.identities'
/**
 * Token sementara auth.users: dikosongkan ('') oleh RPC backup_auth_export
 * (migrasi 028) dan sekali lagi di sini, supaya tidak pernah ikut ke email.
 */
export const AUTH_TEMP_TOKENS = [
  'confirmation_token',
  'recovery_token',
  'email_change_token_new',
  'email_change_token_current',
  'phone_change_token',
  'reauthentication_token',
] as const
/** Batas lampiran; di atas ini email gagal yang dikirim, bukan backup. */
export const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024
export const tooLarge = (bytes: number) => bytes > MAX_ATTACHMENT_BYTES
export const MIN_PASSPHRASE_LENGTH = 12

export type BackupData = {
  meta: { created_at: string; app_version: string; tables: Record<string, number> }
  tables: Record<string, unknown[]>
}

/**
 * Baris auth.users lengkap (termasuk hash password `encrypted_password`, supaya
 * login lama tetap berlaku setelah pemulihan); hanya token sementara dikosongkan.
 */
export function sanitizeAuthUser(row: Record<string, unknown>): Record<string, unknown> {
  const out = { ...row }
  for (const key of AUTH_TEMP_TOKENS) out[key] = ''
  return out
}

export function buildBackup(tables: Record<string, unknown[]>, createdAt: string, appVersion: string): BackupData {
  const counts = Object.fromEntries(Object.entries(tables).map(([name, rows]) => [name, rows.length]))
  return { meta: { created_at: createdAt, app_version: appVersion, tables: counts }, tables }
}

export const totalRows = (meta: BackupData['meta']) => Object.values(meta.tables).reduce((a, b) => a + b, 0)

/**
 * Baca auth.users + auth.identities (RPC migrasi 028) lalu semua tabel public.
 * Urutan kunci `tables` = urutan pemulihan. Butuh client service role; RPC
 * belum ada (migrasi 028 belum jalan) = gagal keras, bukan backup tanpa akun.
 */
export async function collectBackup(client: SupabaseClient, appVersion: string): Promise<BackupData> {
  const { data: auth, error } = await client.rpc('backup_auth_export')
  if (error) throw new Error(`[backup] backup_auth_export gagal: ${error.message}`)
  const { users, identities } = auth as { users: Record<string, unknown>[]; identities: unknown[] }
  const tables: Record<string, unknown[]> = {
    [AUTH_USERS_KEY]: users.map(sanitizeAuthUser),
    [AUTH_IDENTITIES_KEY]: identities,
  }
  for (const [name, order] of BACKUP_TABLES) {
    tables[name] = await allRows((from, to) => {
      let q = client.from(name).select('*')
      for (const column of order) q = q.order(column)
      return q.range(from, to)
    })
  }
  return buildBackup(tables, new Date().toISOString(), appVersion)
}

const HEADER = 'TMSBAK1'
const SCRYPT = { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }

const deriveKey = (passphrase: string, salt: Buffer) => scryptSync(passphrase, salt, 32, SCRYPT)

export function checkPassphrase(passphrase: string | undefined): string | null {
  if (!passphrase) return 'BACKUP_PASSPHRASE belum diisi.'
  if (passphrase.length < MIN_PASSPHRASE_LENGTH) return `BACKUP_PASSPHRASE minimal ${MIN_PASSPHRASE_LENGTH} karakter.`
  return null
}

export function encryptBackup(data: BackupData, passphrase: string): string {
  const salt = randomBytes(16)
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', deriveKey(passphrase, salt), iv)
  cipher.setAAD(Buffer.concat([Buffer.from(HEADER), salt, iv]))
  const body = Buffer.concat([cipher.update(gzipSync(JSON.stringify(data))), cipher.final()])
  const b64 = Buffer.concat([salt, iv, cipher.getAuthTag(), body]).toString('base64')
  return `${HEADER}\n${b64.replace(/.{1,76}/g, '$&\n')}`
}

/** Salah passphrase atau berkas diubah/rusak = melempar Error. */
export function decryptBackup(text: string, passphrase: string): BackupData {
  const [first, ...rest] = text.split('\n')
  if (first.trim() !== HEADER) throw new Error('Bukan berkas backup TMS (header tidak dikenal).')
  const raw = Buffer.from(rest.join(''), 'base64')
  if (raw.length < 16 + 12 + 16 + 1) throw new Error('Berkas backup terpotong.')
  const salt = raw.subarray(0, 16)
  const iv = raw.subarray(16, 28)
  const decipher = createDecipheriv('aes-256-gcm', deriveKey(passphrase, salt), iv)
  decipher.setAAD(Buffer.concat([Buffer.from(HEADER), salt, iv]))
  decipher.setAuthTag(raw.subarray(28, 44))
  let plain: Buffer
  try {
    plain = Buffer.concat([decipher.update(raw.subarray(44)), decipher.final()])
  } catch {
    throw new Error('Passphrase salah atau berkas rusak.')
  }
  return JSON.parse(gunzipSync(plain).toString('utf8')) as BackupData
}

export const backupFileName = (date: string) => `tms-backup-${date}.tmsbak.txt`

export const backupSubject = (date: string, meta: BackupData['meta'], bytes: number) =>
  `[Backup TMS] ${date} (${totalRows(meta)} baris, ${Math.ceil(bytes / 1024)} KB)`

/** Isi email: jumlah baris per tabel + petunjuk dekripsi. Tidak memuat passphrase. */
export function backupEmailHtml(meta: BackupData['meta'], fileName: string): string {
  const rows = Object.entries(meta.tables)
    .map(([name, n]) => `<tr><td style="padding:2px 12px 2px 0;">${h(name)}</td><td style="text-align:right;">${n}</td></tr>`)
    .join('')
  return (
    `<p>Backup database terlampir (<strong>${h(fileName)}</strong>), dibuat ${h(meta.created_at)}, versi ${h(meta.app_version)}.</p>` +
    `<table style="border-collapse:collapse;font-size:13px;">${rows}<tr><td style="padding-top:6px;"><strong>Total</strong></td><td style="text-align:right;padding-top:6px;"><strong>${totalRows(meta)}</strong></td></tr></table>` +
    '<p>Berkas terenkripsi dan memuat hash password semua akun login. Cara membuka: simpan lampiran, lalu dari folder repo jalankan ' +
    `<code>node scripts/backup/decrypt.mjs ${h(fileName)} &gt; backup.json</code> dan isi passphrase backup saat diminta. ` +
    'Langkah pemulihan ada di <code>scripts/backup/README.md</code>. Simpan email ini; jangan teruskan ke orang lain.</p>'
  )
}

export function oversizeEmailHtml(bytes: number): string {
  return (
    `<p><strong>Backup hari ini TIDAK terkirim.</strong> Ukuran berkas ${Math.ceil(bytes / 1024)} KB melebihi batas lampiran ` +
    `${MAX_ATTACHMENT_BYTES / 1024 / 1024} MB.</p>` +
    '<p>Data di database aman (tidak ada yang dihapus), tetapi backup lewat email perlu diganti: ' +
    'jalankan <code>npm run db:backup</code> di laptop pengembang, atau pindah ke penyimpanan lain / paket Supabase berbayar.</p>'
  )
}

/** `a@contoh.com, b@contoh.com` -> daftar alamat; entri tanpa '@' dibuang. */
export const parseRecipients = (value: string | undefined) =>
  (value ?? '').split(',').map((s) => s.trim()).filter((s) => /^[^\s@]+@[^\s@]+$/.test(s))
