/**
 * Uji lib/tasks/transfer-rules.ts — alih task permanen/sementara.
 * Jalankan: npm run test:task-transfer
 */
import { isoToWibLocal, statusAfterStart, transferError, transferTick, wibLocalToISO } from '../lib/tasks/transfer-rules'

let ok = 0
let gagal = 0
function cek(label: string, aktual: unknown, harap: unknown): void {
  if (JSON.stringify(aktual) === JSON.stringify(harap)) ok++
  else {
    gagal++
    console.log(`  [GAGAL] ${label} -> ${JSON.stringify(aktual)} (harus ${JSON.stringify(harap)})`)
  }
}

const now = new Date('2026-11-20T10:00:00Z') // 17:00 WIB
const base = { fromUserId: 'a', toUserId: 'b', startsAt: '', endsAt: '', byManager: false, now }
const iso = (h: number) => new Date(now.getTime() + h * 3600 * 1000).toISOString()

// Waktu WIB
cek('WIB -> UTC', wibLocalToISO('2026-11-21T08:00'), '2026-11-21T01:00:00.000Z')
cek('WIB tidak valid', wibLocalToISO('21/11/2026 08:00'), '')
cek('UTC -> WIB', isoToWibLocal('2026-11-21T01:00:00.000Z'), '2026-11-21T08:00')
cek('WIB pulang-pergi', isoToWibLocal(wibLocalToISO('2026-12-31T23:59')), '2026-12-31T23:59')

// Validasi
cek('jenis wajib', transferError({ ...base, kind: '' }), 'Pilih jenis alih task.')
cek('pengganti wajib', transferError({ ...base, kind: 'PERMANENT', toUserId: '' }), 'Pilih consultant pengganti.')
cek('pengganti = pemegang', transferError({ ...base, kind: 'PERMANENT', toUserId: 'a' }), 'Pengganti harus orang lain, bukan pemegang task sekarang.')
cek('permanen sah', transferError({ ...base, kind: 'PERMANENT' }), null)
cek('sementara tanpa waktu', transferError({ ...base, kind: 'TEMPORARY' }), 'Isi waktu mulai dan waktu selesai.')
cek('sementara selesai <= mulai', transferError({ ...base, kind: 'TEMPORARY', startsAt: iso(2), endsAt: iso(2) }), 'Waktu selesai harus setelah waktu mulai.')
cek('sementara 30 menit sah', transferError({ ...base, kind: 'TEMPORARY', startsAt: iso(1), endsAt: iso(1.5) }), null)
cek('sementara selesai sudah lewat', transferError({ ...base, kind: 'TEMPORARY', startsAt: iso(-5), endsAt: iso(-1), byManager: true }), 'Waktu selesai sudah lewat.')
cek('consultant mulai di masa lalu', transferError({ ...base, kind: 'TEMPORARY', startsAt: iso(-1), endsAt: iso(5) }), 'Waktu mulai tidak boleh di masa lalu.')
cek('consultant mulai 5 menit lalu boleh', transferError({ ...base, kind: 'TEMPORARY', startsAt: iso(-5 / 60), endsAt: iso(5) }), null)
cek('PM mulai di masa lalu boleh', transferError({ ...base, kind: 'TEMPORARY', startsAt: iso(-24), endsAt: iso(5), byManager: true }), null)
cek('consultant > 3 bulan', transferError({ ...base, kind: 'TEMPORARY', startsAt: iso(1), endsAt: iso(1 + 24 * 93) }), 'Rentang paling lama 3 bulan. Untuk lebih lama, minta PM mengalihkan.')
cek('PM > 3 bulan boleh', transferError({ ...base, kind: 'TEMPORARY', startsAt: iso(1), endsAt: iso(1 + 24 * 200), byManager: true }), null)

// Penjadwal
cek('terjadwal belum waktunya', transferTick({ status: 'SCHEDULED', starts_at: iso(1), ends_at: iso(2) }, now), null)
cek('terjadwal sudah waktunya', transferTick({ status: 'SCHEDULED', starts_at: iso(-0.1), ends_at: iso(2) }, now), 'start')
cek('permanen terjadwal (tanpa mulai)', transferTick({ status: 'SCHEDULED', starts_at: null, ends_at: null }, now), 'start')
cek('berjalan belum habis', transferTick({ status: 'ACTIVE', starts_at: iso(-1), ends_at: iso(1) }, now), null)
cek('berjalan sudah habis', transferTick({ status: 'ACTIVE', starts_at: iso(-2), ends_at: iso(0) }, now), 'end')
cek('menunggu PM tidak diproses', transferTick({ status: 'PENDING', starts_at: iso(-2), ends_at: iso(-1) }, now), null)
cek('masa habis tidak diproses lagi', transferTick({ status: 'EXPIRED', starts_at: iso(-2), ends_at: iso(-1) }, now), null)
cek('sesudah mulai: permanen selesai', statusAfterStart('PERMANENT'), 'DONE')
cek('sesudah mulai: sementara berjalan', statusAfterStart('TEMPORARY'), 'ACTIVE')

console.log(`LULUS: ${ok}`)
console.log(`GAGAL: ${gagal}`)
if (gagal > 0) process.exit(1)
