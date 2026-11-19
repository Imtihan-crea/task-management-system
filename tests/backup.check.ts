/**
 * Uji lib/backup/backup.ts dan scripts/backup/decrypt.mjs (data palsu).
 * Jalankan: npm run test:backup
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
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
  pickAuthUser,
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
    [AUTH_USERS_KEY]: [pickAuthUser({ id: 'u1', email: 'satu@contoh.com', created_at: '2026-01-01T00:00:00Z', last_sign_in_at: null })],
  },
  '2026-11-19T19:00:00.000Z',
  'abc1234'
)

// Ringkasan jumlah baris
cek('jumlah per tabel', data.meta.tables, { profiles: 2, tasks: 1, work_logs: 0, [AUTH_USERS_KEY]: 1 })
cek('total baris', totalRows(data.meta), 4)

// Enkripsi-dekripsi bolak-balik
const file = encryptBackup(data, PASS)
cek('header berkas', file.split('\n')[0], 'TMSBAK1')
cek('isi tidak terbaca polos', file.includes('Contoh Satu') || file.includes('contoh.com'), false)
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

// Kolom auth tanpa rahasia
const authRow = pickAuthUser({
  id: 'u9',
  email: 'sembilan@contoh.com',
  created_at: null,
  last_sign_in_at: null,
  encrypted_password: 'hash-palsu',
  confirmation_token: 'token-palsu',
  app_metadata: { provider: 'email' },
} as Parameters<typeof pickAuthUser>[0])
cek('auth hanya 4 kolom', Object.keys(authRow), ['id', 'email', 'created_at', 'last_sign_in_at'])

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
