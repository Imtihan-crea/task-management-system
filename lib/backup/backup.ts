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

/** Isi storage ikut (base64) hanya bila total di bawah ini; selebihnya daftar saja. */
export const MAX_STORAGE_BYTES = 5 * 1024 * 1024

/**
 * Env yang dibutuhkan untuk menghidupkan ulang aplikasi (allow-list, bukan
 * seluruh process.env: variabel sistem/Vercel seperti VERCEL_OIDC_TOKEN tidak
 * ikut). BACKUP_PASSPHRASE sengaja tidak ada: kuncinya tidak boleh ikut di
 * berkas yang ia kunci. tests/backup.check.ts gagal bila kode memakai env
 * baru yang belum ada di sini.
 */
export const ENV_KEYS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'BREVO_API_KEY',
  'BREVO_SENDER_EMAIL',
  'BREVO_SENDER_NAME',
  'CRON_SECRET',
  'APP_URL',
  'APP_TIMEZONE',
  'TRACKER_REMINDER_ENABLED',
  'TRACKER_REMINDER_ONLY',
  'BACKUP_EMAIL_TO',
  'SENTRY_DSN',
  'NEXT_PUBLIC_SENTRY_DSN',
] as const

export type StorageObjectRow = { bucket_id: string; name: string; metadata?: { size?: number } | null }
export type DbConfig = {
  cron_jobs: unknown[]
  policies: unknown[]
  functions: unknown[]
  triggers: unknown[]
  storage_buckets: unknown[]
  storage_objects: StorageObjectRow[]
}
export const EMPTY_DB_CONFIG: DbConfig = { cron_jobs: [], policies: [], functions: [], triggers: [], storage_buckets: [], storage_objects: [] }

export type BackupData = {
  meta: {
    created_at: string
    app_version: string
    tables: Record<string, number>
    /** Hanya status per nama env, tanpa nilai. */
    env: Record<string, 'terisi' | 'kosong'>
    config: Record<keyof DbConfig, number>
    storage: { objects: number; bytes: number; files_included: number }
  }
  tables: Record<string, unknown[]>
  env: Record<string, string | null>
  db_config: DbConfig
  /** `bucket/nama` -> isi berkas base64. */
  storage_files: Record<string, string>
}

export function pickEnv(source: Record<string, string | undefined>): Record<string, string | null> {
  return Object.fromEntries(ENV_KEYS.map((k) => [k, source[k] || null]))
}

export const storageBytes = (objects: StorageObjectRow[]) => objects.reduce((sum, o) => sum + Number(o.metadata?.size ?? 0), 0)

/**
 * Baris auth.users lengkap (termasuk hash password `encrypted_password`, supaya
 * login lama tetap berlaku setelah pemulihan); hanya token sementara dikosongkan.
 */
export function sanitizeAuthUser(row: Record<string, unknown>): Record<string, unknown> {
  const out = { ...row }
  for (const key of AUTH_TEMP_TOKENS) out[key] = ''
  return out
}

export function buildBackup(
  tables: Record<string, unknown[]>,
  createdAt: string,
  appVersion: string,
  extra: { env?: Record<string, string | null>; db_config?: DbConfig; storage_files?: Record<string, string> } = {}
): BackupData {
  const env = extra.env ?? {}
  const db_config = extra.db_config ?? EMPTY_DB_CONFIG
  const storage_files = extra.storage_files ?? {}
  const counts = Object.fromEntries(Object.entries(tables).map(([name, rows]) => [name, rows.length]))
  return {
    meta: {
      created_at: createdAt,
      app_version: appVersion,
      tables: counts,
      env: Object.fromEntries(Object.entries(env).map(([k, v]) => [k, v ? 'terisi' : 'kosong'])),
      config: Object.fromEntries(Object.entries(db_config).map(([k, v]) => [k, v.length])) as Record<keyof DbConfig, number>,
      storage: {
        objects: db_config.storage_objects.length,
        bytes: storageBytes(db_config.storage_objects),
        files_included: Object.keys(storage_files).length,
      },
    },
    tables,
    env,
    db_config,
    storage_files,
  }
}

export const totalRows = (meta: BackupData['meta']) => Object.values(meta.tables).reduce((a, b) => a + b, 0)

/**
 * Baca auth.users + auth.identities (RPC migrasi 028), semua tabel public,
 * konfigurasi database (RPC backup_db_config), isi storage bila kecil, dan env
 * allow-list. Urutan kunci `tables` = urutan pemulihan. Butuh client service
 * role; RPC belum ada (migrasi 028 belum jalan) = gagal keras.
 */
export async function collectBackup(
  client: SupabaseClient,
  appVersion: string,
  envSource: Record<string, string | undefined> = {}
): Promise<BackupData> {
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
  const { data: config, error: configError } = await client.rpc('backup_db_config')
  if (configError) throw new Error(`[backup] backup_db_config gagal: ${configError.message}`)
  const db_config = config as DbConfig
  const storage_files: Record<string, string> = {}
  // shortcut: storage >= 5 MB hanya dicatat daftarnya; bila aplikasi mulai memakai Storage, backup isinya terpisah.
  if (storageBytes(db_config.storage_objects) < MAX_STORAGE_BYTES) {
    for (const o of db_config.storage_objects) {
      const { data, error: dlError } = await client.storage.from(o.bucket_id).download(o.name)
      if (dlError) throw new Error(`[backup] unduh storage gagal: ${dlError.message}`)
      storage_files[`${o.bucket_id}/${o.name}`] = Buffer.from(await data.arrayBuffer()).toString('base64')
    }
  }
  return buildBackup(tables, new Date().toISOString(), appVersion, { env: pickEnv(envSource), db_config, storage_files })
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

/** Isi email: bagian yang ikut dan jumlahnya. Tidak memuat passphrase atau nilai env/data apa pun. */
export function backupEmailHtml(meta: BackupData['meta'], fileName: string): string {
  const row = (label: string, value: string | number) =>
    `<tr><td style="padding:2px 12px 2px 0;">${h(label)}</td><td style="text-align:right;">${h(String(value))}</td></tr>`
  const table = (rows: string) => `<table style="border-collapse:collapse;font-size:13px;">${rows}</table>`
  const tables = Object.entries(meta.tables).map(([name, n]) => row(name, n)).join('') +
    `<tr><td style="padding-top:6px;"><strong>Total</strong></td><td style="text-align:right;padding-top:6px;"><strong>${totalRows(meta)}</strong></td></tr>`
  const env = Object.entries(meta.env).map(([name, status]) => row(name, status)).join('')
  const filled = Object.values(meta.env).filter((v) => v === 'terisi').length
  const c = meta.config
  const s = meta.storage
  return (
    `<p>Backup terlampir (<strong>${h(fileName)}</strong>), dibuat ${h(meta.created_at)}, versi ${h(meta.app_version)}.</p>` +
    `<p><strong>Tabel database</strong> (jumlah baris)</p>${table(tables)}` +
    `<p><strong>Env aplikasi</strong> (${filled} terisi dari ${Object.keys(meta.env).length}; nilai hanya ada di dalam berkas)</p>${table(env)}` +
    '<p><strong>Konfigurasi database</strong></p>' +
    table(row('Jadwal pg_cron', c.cron_jobs) + row('Policy RLS', c.policies) + row('Fungsi', c.functions) + row('Trigger', c.triggers) + row('Bucket storage', c.storage_buckets)) +
    `<p><strong>Storage</strong>: ${s.objects} berkas, ${Math.ceil(s.bytes / 1024)} KB` +
    (s.objects > s.files_included ? `; isi ${s.objects - s.files_included} berkas TIDAK ikut (total di atas ${MAX_STORAGE_BYTES / 1024 / 1024} MB), hanya daftarnya` : '') +
    '.</p>' +
    '<p>Berkas terenkripsi dan memuat hash password semua akun login serta kunci aplikasi (Supabase, Brevo, CRON_SECRET). Cara membuka: simpan lampiran, lalu dari folder repo jalankan ' +
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
