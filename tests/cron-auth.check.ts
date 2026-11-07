/**
 * Uji lib/auth/cron.ts — cek CRON_SECRET timing-safe.
 * Jalankan: npm run test:cron
 */
import { isCronAuthorized } from '../lib/auth/cron'

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

const S = 'rahasia-contoh-123'
cek('header benar', isCronAuthorized(`Bearer ${S}`, S), true)
cek('secret salah', isCronAuthorized('Bearer salah', S), false)
cek('tanpa Bearer', isCronAuthorized(S, S), false)
cek('beda panjang', isCronAuthorized(`Bearer ${S}x`, S), false)
cek('header null', isCronAuthorized(null, S), false)
cek('secret kosong', isCronAuthorized('Bearer ', ''), false)
cek('secret undefined', isCronAuthorized('Bearer undefined', undefined), false)

console.log(`LULUS: ${ok}`)
console.log(`GAGAL: ${gagal}`)
if (gagal > 0) process.exit(1)
