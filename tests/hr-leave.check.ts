/**
 * Uji lib/hr/leave.ts — cuti / izin / sakit.
 * Jalankan: npm run test:hr-leave
 */
import { annualBalance, jointLeaveDays, kindError, leaveDates, leaveDays, leaveDaysIn, overlappingLeave, paidLeaveDays, rangeError, type LeaveRow } from '../lib/hr/leave'

let ok = 0
let gagal = 0
function cek(label: string, aktual: unknown, harap: unknown): void {
  if (JSON.stringify(aktual) === JSON.stringify(harap)) ok++
  else {
    gagal++
    console.log(`  [GAGAL] ${label} -> ${JSON.stringify(aktual)} (harus ${JSON.stringify(harap)})`)
  }
}

const cal = [{ day: '2026-12-25', kind: 'HOLIDAY' as const }, { day: '2026-12-24', kind: 'HOLIDAY' as const }]

// Rentang
cek('rentang sah', rangeError('2026-11-17', '2026-11-18'), null)
cek('selesai sebelum mulai', rangeError('2026-11-18', '2026-11-17') !== null, true)
cek('tanggal rusak', rangeError('2026-13-01', '2026-11-18') !== null, true)
cek('lebih 60 hari', rangeError('2026-01-01', '2026-03-02') !== null, true)
cek('tepat 60 hari', rangeError('2026-01-01', '2026-03-01'), null)

// Hari kerja: Sen 21 Des – Jum 25 Des 2026, libur 24 & 25 -> 3 hari
cek('hari kerja tanpa libur & akhir pekan', leaveDays('2026-12-21', '2026-12-27', cal), 3)
cek('satu hari Sabtu = 0', leaveDays('2026-11-21', '2026-11-21', []), 0)

// Tumpang tindih
const rows: LeaveRow[] = [
  { id: 'a', user_id: 'u', kind: 'CUTI', start_date: '2026-11-17', end_date: '2026-11-19', status: 'APPROVED' },
  { id: 'b', user_id: 'u', kind: 'KHUSUS', start_date: '2026-11-24', end_date: '2026-11-24', status: 'PENDING' },
  { id: 'c', user_id: 'u', kind: 'SAKIT', start_date: '2026-11-26', end_date: '2026-11-26', status: 'REJECTED' },
  { id: 'd', user_id: 'v', kind: 'CUTI', start_date: '2026-11-17', end_date: '2026-11-17', status: 'APPROVED' },
]
cek('bertumpuk dengan disetujui', overlappingLeave(rows, { user_id: 'u', start_date: '2026-11-19', end_date: '2026-11-20' })?.id, 'a')
cek('bertumpuk dengan menunggu', overlappingLeave(rows, { user_id: 'u', start_date: '2026-11-24', end_date: '2026-11-24' })?.id, 'b')
cek('ditolak tidak menghalangi', overlappingLeave(rows, { user_id: 'u', start_date: '2026-11-26', end_date: '2026-11-26' }), null)
cek('user lain tidak menghalangi', overlappingLeave(rows, { user_id: 'w', start_date: '2026-11-17', end_date: '2026-11-17' }), null)
cek('ubah diri sendiri tidak bentrok', overlappingLeave(rows, { id: 'a', user_id: 'u', start_date: '2026-11-17', end_date: '2026-11-18' }), null)

// Per bulan (hanya disetujui, dipotong ke rentang bulan)
const span: LeaveRow[] = [{ user_id: 'u', kind: 'CUTI', start_date: '2026-10-29', end_date: '2026-11-03', status: 'APPROVED' }]
cek('cuti lintas bulan: Okt', leaveDaysIn(span, '2026-10-01', '2026-10-31', []), { CUTI: 2, SAKIT: 0, KHUSUS: 0, TANPA_GAJI: 0 })
cek('cuti lintas bulan: Nov', leaveDaysIn(span, '2026-11-01', '2026-11-30', []), { CUTI: 2, SAKIT: 0, KHUSUS: 0, TANPA_GAJI: 0 })
cek('per jenis Nov u', leaveDaysIn(rows.filter((r) => r.user_id === 'u'), '2026-11-01', '2026-11-30', []), { CUTI: 3, SAKIT: 0, KHUSUS: 0, TANPA_GAJI: 0 })
cek('tanggal cuti (untuk pengingat)', [...leaveDates(rows, '2026-11-18', '2026-11-30', [])], ['2026-11-18', '2026-11-19'])

// Saldo
const year: LeaveRow[] = [
  { user_id: 'u', kind: 'CUTI', start_date: '2026-06-08', end_date: '2026-06-09', status: 'APPROVED' },
  { user_id: 'u', kind: 'CUTI', start_date: '2026-12-21', end_date: '2026-12-23', status: 'PENDING' },
  { user_id: 'u', kind: 'SAKIT', start_date: '2026-05-18', end_date: '2026-05-18', status: 'APPROVED' },
  { user_id: 'u', kind: 'CUTI', start_date: '2025-12-29', end_date: '2026-01-02', status: 'APPROVED' },
]
cek('saldo: 12 − (2 Jun + 2 Jan; 1 Jan libur) ', annualBalance(12, year, '2026', [{ day: '2026-01-01', kind: 'HOLIDAY' }]), { quota: 12, taken: 3, joint: 0, pending: 3, remaining: 9 })
cek('saldo tanpa hak cuti', annualBalance(null, year, '2026', []).remaining, null)

// Cuti bersama memotong saldo (keputusan pemilik 19 Nov 2026); akhir pekan tidak dihitung
const kal = [
  { day: '2026-03-20', kind: 'HOLIDAY', name: 'Cuti Bersama Idul Fitri' },
  { day: '2026-03-21', kind: 'HOLIDAY', name: 'Cuti Bersama (Sabtu)' },
  { day: '2026-12-24', kind: 'HOLIDAY', name: 'cuti bersama natal' },
  { day: '2026-12-25', kind: 'HOLIDAY', name: 'Hari Raya Natal' },
  { day: '2026-04-04', kind: 'WORKDAY', name: 'Cuti bersama diganti masuk' },
]
cek('jumlah cuti bersama', jointLeaveDays(kal), 2)
cek('saldo dipotong cuti bersama', annualBalance(12, year, '2026', [{ day: '2026-01-01', kind: 'HOLIDAY' }], 2), { quota: 12, taken: 3, joint: 2, pending: 3, remaining: 7 })

// Jenis + Cuti Khusus
cek('jenis tak dikenal', kindError('IZIN', null, '2026-11-17', '2026-11-17', 1), 'Pilih jenis cuti.')
cek('khusus tanpa alasan', kindError('KHUSUS', null, '2026-11-17', '2026-11-17', 1), 'Pilih alasan Cuti Khusus.')
cek('menikah 3 hari ok', kindError('KHUSUS', 'MENIKAH', '2026-11-16', '2026-11-18', 3), null)
cek('menikah 4 hari ditolak', kindError('KHUSUS', 'MENIKAH', '2026-11-16', '2026-11-19', 4), 'Cuti Khusus "Menikah" paling lama 3 hari kerja.')
cek('melahirkan 3 bulan ok (melewati batas 60 hari biasa)', kindError('KHUSUS', 'MELAHIRKAN', '2026-01-01', '2026-04-01', 64), null)
cek('melahirkan > 92 hari ditolak', kindError('KHUSUS', 'MELAHIRKAN', '2026-01-01', '2026-04-05', 66) !== null, true)
cek('cuti tahunan tetap maks 60 hari', kindError('CUTI', null, '2026-01-01', '2026-04-01', 64) !== null, true)
cek('luar tanggungan sah', kindError('TANPA_GAJI', null, '2026-11-17', '2026-11-20', 4), null)

// Hari berbayar: luar tanggungan tidak dihitung
cek('paidLeaveDays', paidLeaveDays({ CUTI: 2, SAKIT: 1, KHUSUS: 3, TANPA_GAJI: 5 }), 6)

console.log(`hr-leave: ${ok} lulus, ${gagal} gagal`)
if (gagal) process.exit(1)
