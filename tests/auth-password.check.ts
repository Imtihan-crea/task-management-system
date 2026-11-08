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
  friendlyPasswordError,
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
cek('kosong ditolak', validateAdminPassword(''), 'Password wajib diisi.')
cek('5 karakter ditolak', validateAdminPassword('abcde') !== null, true)
cek('6 karakter diterima', validateAdminPassword('abcdef'), null)
cek('20 karakter diterima', validateAdminPassword('x'.repeat(20)), null)
cek('spasi 6 karakter diterima', validateAdminPassword('      '), null)
cek('4 karakter + spasi ditolak (total 5)', validateAdminPassword('abcd ') !== null, true)
cek('unicode 6 karakter diterima', validateAdminPassword('pässwo'), null)

/* ---------- password baru pilihan user ---------- */
cek('self kosong ditolak', validateSelfPassword('', ''), 'Password wajib diisi.')
cek('self 7 karakter ditolak', validateSelfPassword('abcdefg', 'abcdefg') !== null, true)
cek('self 8 karakter ok', validateSelfPassword('abcdefgh', 'abcdefgh'), null)
cek('self konfirmasi beda ditolak', validateSelfPassword('abcdefgh', 'abcdefgi'), 'Password tidak cocok.')
cek('self konfirmasi kosong ditolak', validateSelfPassword('abcdefgh', ''), 'Password tidak cocok.')
cek('self spasi 8 ok', validateSelfPassword('        ', '        '), null)

// friendlyPasswordError (audit C13)
const EXP = 'expired'
cek('sama dengan lama', friendlyPasswordError('New password should be different from the old password.', EXP), 'Password baru harus berbeda dari Password Anda saat ini.')
cek('sesi habis', friendlyPasswordError('Auth session missing!', EXP), EXP)
cek('rate limit', friendlyPasswordError('For security purposes, you can only request this after 30 seconds.', EXP), 'Terlalu banyak percobaan. Tunggu semenit lalu coba lagi.')
cek('jenis karakter', friendlyPasswordError('Password should contain at least one character of each: abc', EXP), 'Password harus berisi huruf besar dan kecil, angka, dan simbol.')
cek('tak dikenal -> generik', friendlyPasswordError('xyz', EXP), 'Tidak dapat mengubah Password. Silakan coba lagi.')

console.log(`LULUS: ${ok}`)
console.log(`GAGAL: ${gagal}`)
if (gagal > 0) process.exit(1)
