/**
 * Uji boundary aturan password:
 * - password awal yang diketik admin: minimal 6 karakter (selaras Supabase Auth)
 * - password baru pilihan user (/change-password): minimal 8 karakter
 * Jalankan: npm run test:auth
 */
import {
  MIN_ADMIN_PASSWORD_LENGTH,
  MIN_SELF_PASSWORD_LENGTH,
  validateAdminPassword,
  validateSelfPassword,
} from '../lib/auth/password'

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

/* ---------- konstanta ---------- */
cek('admin min = 6', MIN_ADMIN_PASSWORD_LENGTH, 6)
cek('self min = 8', MIN_SELF_PASSWORD_LENGTH, 8)

/* ---------- password awal dari admin ---------- */
cek('kosong ditolak', validateAdminPassword(''), 'Password is required.')
cek('5 karakter ditolak', validateAdminPassword('abcde') !== null, true)
cek('6 karakter diterima', validateAdminPassword('abcdef'), null)
cek('20 karakter diterima', validateAdminPassword('x'.repeat(20)), null)
cek('spasi 6 karakter diterima', validateAdminPassword('      '), null)
cek('4 karakter + spasi ditolak (total 5)', validateAdminPassword('abcd ') !== null, true)
cek('unicode 6 karakter diterima', validateAdminPassword('pässwo'), null)

/* ---------- password baru pilihan user ---------- */
cek('self kosong ditolak', validateSelfPassword('', ''), 'Password is required.')
cek('self 7 karakter ditolak', validateSelfPassword('abcdefg', 'abcdefg') !== null, true)
cek('self 8 karakter ok', validateSelfPassword('abcdefgh', 'abcdefgh'), null)
cek('self konfirmasi beda ditolak', validateSelfPassword('abcdefgh', 'abcdefgi'), 'Passwords do not match.')
cek('self konfirmasi kosong ditolak', validateSelfPassword('abcdefgh', ''), 'Passwords do not match.')
cek('self spasi 8 ok', validateSelfPassword('        ', '        '), null)

console.log(`LULUS: ${ok}`)
console.log(`GAGAL: ${gagal}`)
if (gagal > 0) process.exit(1)
