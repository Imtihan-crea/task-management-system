/**
 * Uji lib/utils/dates.ts: semua tanggal tampil dan dihitung dalam WIB,
 * termasuk di server berzona UTC. Jalankan: npm run test:dates
 */
import { appDateOf, formatDate, formatDateTime } from '../lib/utils/dates'

let ok = 0
let gagal = 0

function cek(label: string, aktual: unknown, harap: unknown): void {
  if (JSON.stringify(aktual) === JSON.stringify(harap)) ok++
  else {
    gagal++
    console.log(`  [GAGAL] ${label} -> ${JSON.stringify(aktual)} (harus ${JSON.stringify(harap)})`)
  }
}

// appDateOf: tanggal WIB dari timestamp
cek('UTC 1 Okt 18:00 -> 2 Okt WIB', appDateOf('2026-10-01T18:00:00Z'), '2026-10-02')
cek('UTC 1 Okt 16:59 -> 1 Okt WIB', appDateOf('2026-10-01T16:59:00Z'), '2026-10-01')
cek('UTC 31 Okt 17:00 -> 1 Nov WIB (awal bulan)', appDateOf('2026-10-31T17:00:00Z'), '2026-11-01')
cek('format Supabase +00:00', appDateOf('2026-10-01T18:00:00+00:00'), '2026-10-02')
cek('null -> kosong', appDateOf(null), '')
cek('tidak valid -> kosong', appDateOf('bukan-tanggal'), '')

// formatDate: timestamp dekat tengah malam
cek('formatDate timestamp 1 Okt 18:00Z -> 02 Okt', formatDate('2026-10-01T18:00:00Z'), '02 Okt 2026')
cek('formatDate timestamp 1 Okt 16:59Z -> 01 Okt', formatDate('2026-10-01T16:59:00Z'), '01 Okt 2026')
// formatDate: tanggal polos (deadline) tidak boleh bergeser
cek('formatDate deadline polos', formatDate('2026-11-10'), '10 Nov 2026')
cek('formatDate deadline akhir bulan', formatDate('2026-10-31'), '31 Okt 2026')
cek('formatDate null', formatDate(null), '-')

// formatDateTime
const dt = formatDateTime('2026-10-01T18:00:00Z')
cek('formatDateTime 18:00Z -> 02 Okt, 01.00', dt, '02 Okt 2026, 01.00')
cek('formatDateTime 16:59Z -> 23.59', formatDateTime('2026-10-01T16:59:00Z'), '01 Okt 2026, 23.59')
cek('formatDateTime null', formatDateTime(null), '-')
cek('formatDateTime tidak valid', formatDateTime('xx'), '-')

console.log(`LULUS: ${ok}`)
console.log(`GAGAL: ${gagal}`)
if (gagal > 0) process.exit(1)
