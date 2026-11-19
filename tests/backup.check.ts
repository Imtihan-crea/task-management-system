/**
 * Uji lib/backup/backup.ts dan scripts/backup/decrypt.mjs (data palsu).
 * Jalankan: npm run test:backup
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  AUTH_IDENTITIES_KEY,
  AUTH_TEMP_TOKENS,
  AUTH_USERS_KEY,
  BACKUP_TABLES,
  MAX_ATTACHMENT_BYTES,
  backupEmailHtml,
  backupSubject,
  buildBackup,
  checkPassphrase,
  decryptBackup,
  encryptBackup,
  parseRecipients,
  sanitizeAuthUser,
  tooLarge,
  totalRows,
} from '../lib/backup/backup'

let ok = 0
let gagal = 0

function cek(label: string, aktual: unknown, harap: unknown): void {
  if (JSON.stringify(aktual) === JSON.stringify(harap)) {
    ok++
  } else {
    gagal++
    console.log(`  [GAGAL] ${label} -> ${JSON.stringify(aktual)} (harus ${JSON.stringify(harap)})`)
  }
}

function galat(fn: () => unknown): string {
  try {
    fn()
    return 'tidak gagal'
  } catch (error) {
    return (error as Error).message
  }
}

const PASS = 'passphrase-uji-panjang'
const data = buildBackup(
  {
    profiles: [{ id: 'u1', full_name: 'Contoh Satu' }, { id: 'u2', full_name: 'Contoh Dua' }],
    tasks: [{ id: 't1', title: 'Tugas "kutip" & <tag>' }],
    work_logs: [],
    [AUTH_IDENTITIES_KEY]: [],
    [AUTH_USERS_KEY]: [sanitizeAuthUser({ id: 'u1', email: 'satu@contoh.com', encrypted_password: '$2a$10$hashpalsu' })],
  },
  '2026-11-19T19:00:00.000Z',
  'abc1234'
)

// Ringkasan jumlah baris
cek('jumlah per tabel', data.meta.tables, { profiles: 2, tasks: 1, work_logs: 0, [AUTH_IDENTITIES_KEY]: 0, [AUTH_USERS_KEY]: 1 })
cek('total baris', totalRows(data.meta), 4)

// Enkripsi-dekripsi bolak-balik
const file = encryptBackup(data, PASS)
cek('header berkas', file.split('\n')[0], 'TMSBAK1')
cek('isi tidak terbaca polos', file.includes('Contoh Satu') || file.includes('contoh.com') || file.includes('hashpalsu'), false)
cek('bolak-balik identik', decryptBackup(file, PASS), data)
cek('salt/iv acak: dua enkripsi berbeda', encryptBackup(data, PASS) === file, false)

// Passphrase salah, berkas rusak, header salah, terpotong
cek('passphrase salah', galat(() => decryptBackup(file, PASS + 'x')), 'Passphrase salah atau berkas rusak.')
const lines = file.split('\n')
const mid = lines[2]
lines[2] = (mid[0] === 'A' ? 'B' : 'A') + mid.slice(1)
cek('berkas rusak (1 karakter diubah)', galat(() => decryptBackup(lines.join('\n'), PASS)), 'Passphrase salah atau berkas rusak.')
cek('header salah', galat(() => decryptBackup(file.replace('TMSBAK1', 'TMSBAK9'), PASS)), 'Bukan berkas backup TMS (header tidak dikenal).')
cek('terpotong', galat(() => decryptBackup('TMSBAK1\nAAAA\n', PASS)), 'Berkas backup terpotong.')

// Akun login: hash ikut (login lama pulih), token sementara tidak
const authRow = sanitizeAuthUser({
  id: 'u9',
  email: 'sembilan@contoh.com',
  encrypted_password: '$2a$10$hashpalsu',
  raw_app_meta_data: { provider: 'email' },
  banned_until: null,
  ...Object.fromEntries(AUTH_TEMP_TOKENS.map((k) => [k, `token-palsu-${k}`])),
})
cek('hash password ikut', authRow.encrypted_password, '$2a$10$hashpalsu')
cek('metadata ikut', authRow.raw_app_meta_data, { provider: 'email' })
cek('token sementara dikosongkan', AUTH_TEMP_TOKENS.map((k) => authRow[k]), AUTH_TEMP_TOKENS.map(() => ''))
cek('nilai token tidak tersisa', JSON.stringify(authRow).includes('token-palsu'), false)

// Migrasi 028: fungsi hanya untuk service_role, token sama dengan kode
const sql028 = readFileSync(join(__dirname, '..', 'database', 'migrations', '028_backup_auth_export.sql'), 'utf8')
const sqlCode = sql028.replace(/--.*$/gm, '').replace(/\s+/g, ' ').toLowerCase()
cek('028: security definer', sqlCode.includes('security definer'), true)
cek("028: search_path ''", sqlCode.includes("set search_path = ''"), true)
cek('028: revoke public/anon/authenticated', sqlCode.includes('revoke all on function public.backup_auth_export() from public, anon, authenticated;'), true)
cek('028: grant hanya service_role', [...sqlCode.matchAll(/grant execute on function public\.backup_auth_export\(\) to ([a-z_, ]+);/g)].map((m) => m[1]), ['service_role'])
cek('028: semua token dikosongkan', AUTH_TEMP_TOKENS.filter((k) => !sqlCode.includes(`'${k}', ''`)), [])
cek('028: hash tidak dibuang', /- 'encrypted_password'/.test(sqlCode), false)
cek('028: identities ikut', sqlCode.includes('from auth.identities'), true)
cek('028: tercatat di app_migrations', sqlCode.includes("values ('028', '028_backup_auth_export'"), true)

// Batas ukuran
cek('batas 8 MB', MAX_ATTACHMENT_BYTES, 8 * 1024 * 1024)
cek('tepat batas lolos', tooLarge(MAX_ATTACHMENT_BYTES), false)
cek('lewat batas ditolak', tooLarge(MAX_ATTACHMENT_BYTES + 1), true)

// Passphrase dan penerima
cek('passphrase kosong', checkPassphrase(undefined), 'BACKUP_PASSPHRASE belum diisi.')
cek('passphrase pendek', checkPassphrase('pendek'), 'BACKUP_PASSPHRASE minimal 12 karakter.')
cek('passphrase cukup', checkPassphrase(PASS), null)
cek('penerima dipisah koma', parseRecipients(' a@contoh.com, bukan-email ,b@contoh.com,'), ['a@contoh.com', 'b@contoh.com'])
cek('penerima kosong', parseRecipients(undefined), [])

// Subjek + isi email tanpa passphrase
cek('subjek', backupSubject('2026-11-20', data.meta, 2048), '[Backup TMS] 2026-11-20 (4 baris, 2 KB)')
const html = backupEmailHtml(data.meta, 'tms-backup-2026-11-20.tmsbak.txt')
cek('email tanpa passphrase', html.includes(PASS), false)
cek('email memuat tabel', html.includes('profiles') && html.includes('<strong>4</strong>'), true)

// Semua tabel di migrasi ikut dibackup (gagal bila tabel baru lupa didaftarkan)
const migrationsDir = join(__dirname, '..', 'database', 'migrations')
const created = new Set<string>()
for (const name of readdirSync(migrationsDir).filter((f) => f.endsWith('.sql'))) {
  for (const m of readFileSync(join(migrationsDir, name), 'utf8').matchAll(/create table if not exists public\.([a-z_]+)/gi)) created.add(m[1])
}
const listed = BACKUP_TABLES.map(([name]) => name)
cek('tabel migrasi belum di BACKUP_TABLES', [...created].filter((t) => !listed.includes(t)).sort(), [])
cek('BACKUP_TABLES tanpa tabel fiktif', listed.filter((t) => !created.has(t)), [])
cek('BACKUP_TABLES tanpa duplikat', new Set(listed).size, listed.length)

// Skrip pemulihan membaca format yang sama
const dir = mkdtempSync(join(tmpdir(), 'tms-backup-uji-'))
try {
  const path = join(dir, 'uji.tmsbak.txt')
  writeFileSync(path, file)
  const script = join(__dirname, '..', 'scripts', 'backup', 'decrypt.mjs')
  const out = execFileSync(process.execPath, [script, path], { env: { ...process.env, BACKUP_PASSPHRASE: PASS }, encoding: 'utf8' })
  cek('decrypt.mjs bolak-balik', JSON.parse(out), data)
  const salah = spawnSync(process.execPath, [script, path], { env: { ...process.env, BACKUP_PASSPHRASE: 'salah-sekali-123' }, encoding: 'utf8' })
  cek('decrypt.mjs passphrase salah = exit 1', [salah.status, salah.stdout], [1, ''])
} finally {
  rmSync(dir, { recursive: true, force: true })
}

console.log(`LULUS: ${ok}`)
console.log(`GAGAL: ${gagal}`)
if (gagal > 0) process.exit(1)
