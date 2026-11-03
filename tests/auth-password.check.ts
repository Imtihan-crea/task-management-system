/**
 * Uji boundary aturan password (3 Nov 2026):
 * - password awal yang diketik admin: minimal 4 karakter
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
cek('admin min = 4', MIN_ADMIN_PASSWORD_LENGTH, 4)
cek('self min = 8', MIN_SELF_PASSWORD_LENGTH, 8)

/* ---------- password awal dari admin ---------- */
cek('kosong ditolak', validateAdminPassword(''), 'Password is required.')
cek('3 karakter ditolak', validateAdminPassword('abc') !== null, true)
cek('4 karakter diterima', validateAdminPassword('abcd'), null)
cek('20 karakter diterima', validateAdminPassword('x'.repeat(20)), null)
cek('spasi 4 karakter diterima', validateAdminPassword('    '), null)
cek('3 karakter + spasi ditolak', validateAdminPassword('ab ') !== null, true)
cek('unicode 4 karakter diterima', validateAdminPassword('päss'), null)

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
