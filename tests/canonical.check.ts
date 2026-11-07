/**
 * Uji aturan satu alamat resmi (7 Nov 2026):
 * https://kasuat-task.vercel.app
 * Jalankan: npm run test:canonical
 */
import {
  CANONICAL_HOST,
  CANONICAL_ORIGIN,
  canonicalUrl,
  isLegacyHost,
  normalizeHost,
  shouldRedirectMethod,
} from '../lib/config/canonical'

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
cek('host resmi', CANONICAL_HOST, 'kasuat-task.vercel.app')
cek('origin resmi', CANONICAL_ORIGIN, 'https://kasuat-task.vercel.app')

/* ---------- normalizeHost ---------- */
cek('port dibuang', normalizeHost('kasuat-task.vercel.app:443'), 'kasuat-task.vercel.app')
cek('lowercase', normalizeHost('KASUAT-TASK.VERCEL.APP'), 'kasuat-task.vercel.app')
cek('spasi dibuang', normalizeHost('  kasuat-task.vercel.app  '), 'kasuat-task.vercel.app')
cek('null jadi kosong', normalizeHost(null), '')
cek('undefined jadi kosong', normalizeHost(undefined), '')

/* ---------- host lama harus dialihkan ---------- */
cek('domain lama', isLegacyHost('task-management-system-jatc.vercel.app'), true)
cek('domain lama + port', isLegacyHost('task-management-system-jatc.vercel.app:443'), true)
cek('preview lama', isLegacyHost('task-management-system-jatc-iantteaa-1814.vercel.app'), true)
cek('domain lama huruf besar', isLegacyHost('TASK-MANAGEMENT-SYSTEM-JATC.VERCEL.APP'), true)

/* ---------- host resmi & lainnya TIDAK dialihkan ---------- */
cek('domain resmi', isLegacyHost('kasuat-task.vercel.app'), false)
cek('domain resmi + port', isLegacyHost('kasuat-task.vercel.app:3000'), false)
cek('localhost', isLegacyHost('localhost:3000'), false)
cek('preview baru', isLegacyHost('kasuat-task-abc123-iantteaa.vercel.app'), false)
cek('domain lain', isLegacyHost('contoh.com'), false)
cek('null', isLegacyHost(null), false)

/* ---------- canonicalUrl ---------- */
cek('path login', canonicalUrl('/login'), 'https://kasuat-task.vercel.app/login')
cek('path tanpa slash', canonicalUrl('login'), 'https://kasuat-task.vercel.app/login')
cek('root', canonicalUrl('/'), 'https://kasuat-task.vercel.app/')
cek('query dipertahankan', canonicalUrl('/tasks', '?status=OPEN'), 'https://kasuat-task.vercel.app/tasks?status=OPEN')
cek('query kosong', canonicalUrl('/tasks'), 'https://kasuat-task.vercel.app/tasks')

/* ---------- method ---------- */
cek('GET dialihkan', shouldRedirectMethod('GET'), true)
cek('HEAD dialihkan', shouldRedirectMethod('HEAD'), true)
cek('get lowercase', shouldRedirectMethod('get'), true)
cek('POST tidak dialihkan (cron)', shouldRedirectMethod('POST'), false)
cek('PUT tidak dialihkan', shouldRedirectMethod('PUT'), false)

console.log(`LULUS: ${ok}`)
console.log(`GAGAL: ${gagal}`)
if (gagal > 0) process.exit(1)
