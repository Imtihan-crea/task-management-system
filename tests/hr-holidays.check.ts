/**
 * Uji lib/hr/holidays.ts — impor libur nasional dari data publik.
 * Jalankan: npm run test:hr-holidays
 */
import { newHolidays, parseHolidayFeed } from '../lib/hr/holidays'

let ok = 0
let gagal = 0
function cek(label: string, aktual: unknown, harap: unknown): void {
  if (JSON.stringify(aktual) === JSON.stringify(harap)) ok++
  else {
    gagal++
    console.log(`  [GAGAL] ${label} -> ${JSON.stringify(aktual)} (harus ${JSON.stringify(harap)})`)
  }
}

const feed = {
  info: { source: 'contoh' },
  '2026-03-21': { holiday: true, summary: ['Hari Idul Fitri'], description: ['Hari libur nasional'] },
  '2026-03-20': { holiday: true, summary: ['Cuti Bersama Idul Fitri'], description: ['Hari libur nasional'] },
  '2026-02-19': { holiday: false, summary: ['1 Ramadan'], description: ['Perayaan'] },
  '2026-06-01': { holiday: true, summary: ['Hari A', 'Hari B'] },
  '2026-07-01': { holiday: true, summary: [] },
  '2027-01-01': { holiday: true, summary: ['Hari Tahun Baru'] },
  '2026-13-99x': { holiday: true, summary: ['rusak'] },
  '2026-08-17': null,
}

cek('ambil tahun 2026, urut, abaikan Perayaan/rusak/tahun lain', parseHolidayFeed(feed, '2026'), [
  { day: '2026-03-20', name: 'Cuti Bersama Idul Fitri' },
  { day: '2026-03-21', name: 'Hari Idul Fitri' },
  { day: '2026-06-01', name: 'Hari A / Hari B' },
  { day: '2026-07-01', name: 'Libur nasional' },
])
cek('tahun lain', parseHolidayFeed(feed, '2027'), [{ day: '2027-01-01', name: 'Hari Tahun Baru' }])
cek('bukan objek', parseHolidayFeed('Payment required', '2026'), [])
cek('null', parseHolidayFeed(null, '2026'), [])
cek('nama dipotong 120', parseHolidayFeed({ '2026-01-01': { holiday: true, summary: ['x'.repeat(200)] } }, '2026')[0].name.length, 120)

const list = parseHolidayFeed(feed, '2026')
cek('isian HR tidak ditimpa', newHolidays(list, ['2026-03-20', '2026-06-01']).map((h) => h.day), ['2026-03-21', '2026-07-01'])
cek('kalender kosong = semua', newHolidays(list, []).length, 4)

console.log(`hr-holidays: ${ok} lulus, ${gagal} gagal`)
if (gagal) process.exit(1)
