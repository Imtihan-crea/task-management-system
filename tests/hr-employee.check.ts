/**
 * Uji lib/hr/employee.ts — data karyawan di profil.
 * Jalankan: npm run test:hr-employee
 */
import { parseEmployee, type EmployeeFields } from '../lib/hr/employee'

let ok = 0
let gagal = 0
function cek(label: string, aktual: unknown, harap: unknown): void {
  if (JSON.stringify(aktual) === JSON.stringify(harap)) ok++
  else {
    gagal++
    console.log(`  [GAGAL] ${label} -> ${JSON.stringify(aktual)} (harus ${JSON.stringify(harap)})`)
  }
}

const empty: EmployeeFields = { division: null, position_title: null, position_level: null, join_date: null, annual_leave_quota: null }
const ctx = { divisions: ['Operation', 'HR'], positions: ['CEO'], current: { ...empty, division: 'Divisi Lama' }, today: '2026-11-16' }
const base = { division: '', position_title: '', position_level: '', join_date: '', annual_leave_quota: '' }

cek('semua kosong', parseEmployee(base, ctx), { value: empty })
cek('lengkap', parseEmployee({ division: 'HR', position_title: 'CEO', position_level: 'BUSINESS_LEAD', join_date: '2024-01-15', annual_leave_quota: '12' }, ctx), {
  value: { division: 'HR', position_title: 'CEO', position_level: 'BUSINESS_LEAD', join_date: '2024-01-15', annual_leave_quota: 12 },
})
cek('divisi di luar master ditolak', 'error' in parseEmployee({ ...base, division: 'Ngawur' }, ctx), true)
cek('divisi lama (arsip) tetap boleh', parseEmployee({ ...base, division: 'Divisi Lama' }, ctx), { value: { ...empty, division: 'Divisi Lama' } })
cek('jabatan di luar master ditolak', 'error' in parseEmployee({ ...base, position_title: 'Direktur' }, ctx), true)
cek('level tidak valid', 'error' in parseEmployee({ ...base, position_level: 'BOS' }, ctx), true)
cek('tanggal masuk rusak', 'error' in parseEmployee({ ...base, join_date: '2024-13-40' }, ctx), true)
cek('tanggal masuk masa depan', 'error' in parseEmployee({ ...base, join_date: '2027-01-01' }, ctx), true)
cek('kuota pecahan ditolak', 'error' in parseEmployee({ ...base, annual_leave_quota: '1.5' }, ctx), true)
cek('kuota 61 ditolak', 'error' in parseEmployee({ ...base, annual_leave_quota: '61' }, ctx), true)
cek('kuota 0 boleh', parseEmployee({ ...base, annual_leave_quota: '0' }, ctx), { value: { ...empty, annual_leave_quota: 0 } })

console.log(`hr-employee: ${ok} lulus, ${gagal} gagal`)
if (gagal) process.exit(1)
