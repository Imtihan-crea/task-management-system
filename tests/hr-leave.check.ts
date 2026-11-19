/**
 * Uji lib/hr/leave.ts — cuti / izin / sakit.
 * Jalankan: npm run test:hr-leave
 */
import { activeTypes, annualBalance, columnTypes, jointLeaveDays, jointQuotaDays, kindError, kindLabels, leaveDates, leaveDays, leaveDaysIn, overlappingLeave, paidLeaveDays, rangeError, type LeaveRow, type LeaveType } from '../lib/hr/leave'

let ok = 0
let gagal = 0
function cek(label: string, aktual: unknown, harap: unknown): void {
  if (JSON.stringify(aktual) === JSON.stringify(harap)) ok++
  else {
    gagal++
    console.log(`  [GAGAL] ${label} -> ${JSON.stringify(aktual)} (harus ${JSON.stringify(harap)})`)
  }
}

const tp = (code: string, label: string, counts_hours: boolean, uses_quota: boolean, max_days: number | null = null, archived_at: string | null = null): LeaveType => ({
  code, label, description: null, counts_hours, uses_quota, max_days, archived_at,
})
// Isi awal migrasi 027
const TYPES: LeaveType[] = [
  tp('CUTI', 'Cuti Tahunan', true, true),
  tp('SAKIT', 'Cuti Sakit', true, false),
  tp('KHUSUS', 'Cuti Khusus', true, false),
  tp('TANPA_GAJI', 'Cuti di Luar Tanggungan', false, false),
]

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
cek('cuti lintas bulan: Okt', leaveDaysIn(span, '2026-10-01', '2026-10-31', []), { CUTI: 2 })
cek('cuti lintas bulan: Nov', leaveDaysIn(span, '2026-11-01', '2026-11-30', []), { CUTI: 2 })
cek('per jenis Nov u', leaveDaysIn(rows.filter((r) => r.user_id === 'u'), '2026-11-01', '2026-11-30', []), { CUTI: 3 })
cek('tanggal cuti (untuk pengingat)', [...leaveDates(rows, '2026-11-18', '2026-11-30', [])], ['2026-11-18', '2026-11-19'])

// Saldo
const year: LeaveRow[] = [
  { user_id: 'u', kind: 'CUTI', start_date: '2026-06-08', end_date: '2026-06-09', status: 'APPROVED' },
  { user_id: 'u', kind: 'CUTI', start_date: '2026-12-21', end_date: '2026-12-23', status: 'PENDING' },
  { user_id: 'u', kind: 'SAKIT', start_date: '2026-05-18', end_date: '2026-05-18', status: 'APPROVED' },
  { user_id: 'u', kind: 'CUTI', start_date: '2025-12-29', end_date: '2026-01-02', status: 'APPROVED' },
]
cek('saldo: 12 − (2 Jun + 2 Jan; 1 Jan libur) ', annualBalance(12, year, '2026', [{ day: '2026-01-01', kind: 'HOLIDAY' }], 0, TYPES), { quota: 12, taken: 3, joint: 0, pending: 3, remaining: 9 })
cek('saldo tanpa hak cuti', annualBalance(null, year, '2026', [], 0, TYPES).remaining, null)

// Cuti bersama memotong saldo (keputusan pemilik 19 Nov 2026); akhir pekan tidak dihitung
const kal = [
  { day: '2026-03-20', kind: 'HOLIDAY', name: 'Cuti Bersama Idul Fitri' },
  { day: '2026-03-21', kind: 'HOLIDAY', name: 'Cuti Bersama (Sabtu)' },
  { day: '2026-12-24', kind: 'HOLIDAY', name: 'cuti bersama natal' },
  { day: '2026-12-25', kind: 'HOLIDAY', name: 'Hari Raya Natal' },
  { day: '2026-04-04', kind: 'WORKDAY', name: 'Cuti bersama diganti masuk' },
]
cek('jumlah cuti bersama', jointLeaveDays(kal), 2)
cek('saldo dipotong cuti bersama', annualBalance(12, year, '2026', [{ day: '2026-01-01', kind: 'HOLIDAY' }], 2, TYPES), { quota: 12, taken: 3, joint: 2, pending: 3, remaining: 7 })

// Jenis + Cuti Khusus
cek('jenis tak dikenal', kindError(TYPES, 'IZIN', null, '2026-11-17', '2026-11-17', 1), 'Pilih jenis cuti.')
cek('khusus tanpa alasan', kindError(TYPES, 'KHUSUS', null, '2026-11-17', '2026-11-17', 1), 'Pilih alasan Cuti Khusus.')
cek('menikah 3 hari ok', kindError(TYPES, 'KHUSUS', 'MENIKAH', '2026-11-16', '2026-11-18', 3), null)
cek('menikah 4 hari ditolak', kindError(TYPES, 'KHUSUS', 'MENIKAH', '2026-11-16', '2026-11-19', 4), 'Cuti Khusus "Menikah" paling lama 3 hari kerja.')
cek('melahirkan 3 bulan ok (melewati batas 60 hari biasa)', kindError(TYPES, 'KHUSUS', 'MELAHIRKAN', '2026-01-01', '2026-04-01', 64), null)
cek('melahirkan > 92 hari ditolak', kindError(TYPES, 'KHUSUS', 'MELAHIRKAN', '2026-01-01', '2026-04-05', 66) !== null, true)
cek('cuti tahunan tetap maks 60 hari', kindError(TYPES, 'CUTI', null, '2026-01-01', '2026-04-01', 64) !== null, true)
cek('luar tanggungan sah', kindError(TYPES, 'TANPA_GAJI', null, '2026-11-17', '2026-11-20', 4), null)

// Hari berbayar: luar tanggungan tidak dihitung
cek('paidLeaveDays', paidLeaveDays({ CUTI: 2, SAKIT: 1, KHUSUS: 3, TANPA_GAJI: 5 }, TYPES), 6)

// Jenis dari master (migrasi 027)
const CB = tp('CUTI_BESAR', 'Cuti Besar', true, true, 30)
const T2 = [...TYPES, CB]
cek('jenis baru dari master sah', kindError(T2, 'CUTI_BESAR', null, '2026-11-17', '2026-11-20', 4), null)
cek('jenis baru tak ada di master ditolak', kindError(TYPES, 'CUTI_BESAR', null, '2026-11-17', '2026-11-17', 1), 'Pilih jenis cuti.')
const T3 = [...TYPES.slice(0, 3), tp('TANPA_GAJI', 'Cuti di Luar Tanggungan', false, false, null, '2026-11-19T00:00:00Z')]
cek('jenis diarsipkan ditolak', kindError(T3, 'TANPA_GAJI', null, '2026-11-17', '2026-11-17', 1), 'Pilih jenis cuti.')
cek('daftar aktif tanpa arsip', activeTypes(T3).map((t) => t.code), ['CUTI', 'SAKIT', 'KHUSUS'])
const T4 = TYPES.map((t) => (t.code === 'SAKIT' ? { ...t, max_days: 2 } : t))
cek('max_days: 2 hari ok', kindError(T4, 'SAKIT', null, '2026-11-17', '2026-11-18', 2), null)
cek('max_days: 3 hari ditolak', kindError(T4, 'SAKIT', null, '2026-11-17', '2026-11-19', 3), 'Cuti Sakit paling lama 2 hari kerja per pengajuan.')
cek('max_days kosong = tanpa batas khusus (maks 60 hari kalender)', kindError(TYPES, 'SAKIT', null, '2026-11-02', '2026-11-30', 20), null)
cek('max_days ikut berlaku di Cuti Khusus', kindError(TYPES.map((t) => (t.code === 'KHUSUS' ? { ...t, max_days: 1 } : t)), 'KHUSUS', 'MENIKAH', '2026-11-16', '2026-11-17', 2), 'Cuti Khusus paling lama 1 hari kerja per pengajuan.')
cek('label dari master', kindLabels(T2).CUTI_BESAR, 'Cuti Besar')

// uses_quota pada jenis selain CUTI memotong saldo; CUTI yang uses_quota=false tidak
const sakitRows: LeaveRow[] = [
  { user_id: 'u', kind: 'SAKIT', start_date: '2026-05-18', end_date: '2026-05-19', status: 'APPROVED' },
  { user_id: 'u', kind: 'CUTI', start_date: '2026-06-08', end_date: '2026-06-08', status: 'APPROVED' },
  { user_id: 'u', kind: 'CUTI_BESAR', start_date: '2026-07-06', end_date: '2026-07-07', status: 'PENDING' },
]
cek('saldo: SAKIT memotong bila uses_quota', annualBalance(12, sakitRows, '2026', [], 0, T2.map((t) => (t.code === 'SAKIT' ? { ...t, uses_quota: true } : t))), { quota: 12, taken: 3, joint: 0, pending: 2, remaining: 9 })
cek('saldo: bawaan hanya CUTI + jenis baru uses_quota', annualBalance(12, sakitRows, '2026', [], 0, T2), { quota: 12, taken: 1, joint: 0, pending: 2, remaining: 11 })
cek('saldo: CUTI uses_quota=false tidak memotong', annualBalance(12, sakitRows, '2026', [], 0, T2.map((t) => (t.code === 'CUTI' ? { ...t, uses_quota: false } : t))).taken, 0)

// counts_hours=false tidak menambah jam
cek('counts_hours=false tidak dihitung', paidLeaveDays({ CUTI: 2, SAKIT: 1 }, TYPES.map((t) => (t.code === 'SAKIT' ? { ...t, counts_hours: false } : t))), 2)
cek('jenis baru counts_hours dihitung', paidLeaveDays({ CUTI_BESAR: 4 }, T2), 4)
cek('kode tak dikenal tidak dihitung', paidLeaveDays({ LAMA: 4 }, TYPES), 0)
cek('leaveDaysIn dinamis per jenis', leaveDaysIn([{ user_id: 'u', kind: 'CUTI_BESAR', start_date: '2026-11-17', end_date: '2026-11-18', status: 'APPROVED' }], '2026-11-01', '2026-11-30', []), { CUTI_BESAR: 2 })

// Kolom rekap: jenis aktif + arsip yang masih punya hari
cek('kolom: arsip tanpa data tersembunyi', columnTypes(T3, [{ CUTI: 1 }]).map((t) => t.code), ['CUTI', 'SAKIT', 'KHUSUS'])
cek('kolom: arsip dengan data tampil', columnTypes(T3, [{ TANPA_GAJI: 2 }]).map((t) => t.code), ['CUTI', 'SAKIT', 'KHUSUS', 'TANPA_GAJI'])

// jointLeaveUsesQuota
cek('cuti bersama memotong (bawaan)', jointQuotaDays(kal, true), 2)
cek('jointLeaveUsesQuota=false: tidak memotong', jointQuotaDays(kal, false), 0)
cek('saldo tanpa potongan cuti bersama', annualBalance(12, year, '2026', [{ day: '2026-01-01', kind: 'HOLIDAY' }], jointQuotaDays(kal, false), TYPES).remaining, 9)

console.log(`hr-leave: ${ok} lulus, ${gagal} gagal`)
if (gagal) process.exit(1)
