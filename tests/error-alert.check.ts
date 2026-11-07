/**
 * Uji lib/monitoring/error-alert.ts — isi dan key dedupe email error.
 * Jalankan: npm run test:alert
 */
import { buildErrorAlert } from '../lib/monitoring/error-alert'

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

const base = {
  path: '/tasks/1?x=1',
  method: 'POST',
  routePath: '/tasks/[id]',
  routeType: 'action',
  now: new Date('2026-11-07T10:15:00Z'),
}
const withDigest = Object.assign(new Error('boom'), { digest: 'D123' })

const a = buildErrorAlert({ ...base, error: withDigest })
cek('key = tanggal WIB', a.key, 'server-error:2026-11-07')
cek('subject', a.subject, '[ERROR] POST /tasks/[id]')
cek('digest tampil', a.html.includes('D123'), true)

const otherErrSameDay = buildErrorAlert({ ...base, error: new Error('lain'), now: new Date('2026-11-07T16:59:59Z') })
cek('error lain, hari WIB sama = key sama (tidak dikirim)', otherErrSameDay.key, a.key)
const nextDayWib = buildErrorAlert({ ...base, error: withDigest, now: new Date('2026-11-07T17:00:00Z') })
cek('17:00 UTC = 00:00 WIB besok = key baru', nextDayWib.key, 'server-error:2026-11-08')
const lateUtcPrevDay = buildErrorAlert({ ...base, error: withDigest, now: new Date('2026-11-06T18:30:00Z') })
cek('18:30 UTC tgl 6 = 01:30 WIB tgl 7', lateUtcPrevDay.key, 'server-error:2026-11-07')

const noDigest = buildErrorAlert({ ...base, error: new Error('gagal simpan') })
cek('tanpa digest: tidak ada baris digest', noDigest.html.includes('Digest'), false)

const xss = buildErrorAlert({ ...base, error: new Error('<script>alert(1)</script>') })
cek('pesan di-escape', xss.html.includes('<script>'), false)
cek('pesan escape tampil', xss.html.includes('&lt;script&gt;'), true)

const long = buildErrorAlert({ ...base, error: new Error('x'.repeat(2000)) })
cek('pesan dipotong 500', long.html.includes('x'.repeat(501)), false)

const nonError = buildErrorAlert({ ...base, error: 'string error' })
cek('error bukan Error tetap jalan', nonError.html.includes('string error'), true)

console.log(`LULUS: ${ok}`)
console.log(`GAGAL: ${gagal}`)
if (gagal > 0) process.exit(1)
