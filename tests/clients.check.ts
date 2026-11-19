/**
 * Uji lib/clients/pipeline.ts: validasi lead dan transisi tahap (Client Management).
 * Jalankan: npm run test:clients
 */
import { allowedTargets, canMove, emailError, leadError, parseValue, phoneError, stageChangeError, summarize, type LeadInput, type LeadStage } from '../lib/clients/pipeline'

let ok = 0
let gagal = 0
function cek(label: string, aktual: unknown, harap: unknown): void {
  if (JSON.stringify(aktual) === JSON.stringify(harap)) ok++
  else {
    gagal++
    console.log(`  [GAGAL] ${label} -> ${JSON.stringify(aktual)} (harus ${JSON.stringify(harap)})`)
  }
}

const base: LeadInput = { company_name: 'PT Contoh Uji', contact_name: 'Budi Uji', contact_email: 'budi@example.invalid', contact_phone: '+62 812-3456-7890', source: 'Referral', estimated_value: 1500000, notes: null }

// Validasi lead
cek('lead sah', leadError(base), null)
cek('nama perusahaan kosong', leadError({ ...base, company_name: '  ' }) !== null, true)
cek('nilai negatif', leadError({ ...base, estimated_value: -1 }) !== null, true)
cek('nilai NaN', leadError({ ...base, estimated_value: NaN }) !== null, true)
cek('nilai 0 boleh', leadError({ ...base, estimated_value: 0 }), null)
cek('kontak opsional', leadError({ ...base, contact_name: null, contact_email: null, contact_phone: null }), null)
cek('email rusak', leadError({ ...base, contact_email: 'budi@' }) !== null, true)
cek('email tanpa titik domain', emailError('a@b'), 'Format email kontak tidak valid.')
cek('email berspasi', emailError('a b@contoh.com') !== null, true)
cek('telepon huruf', phoneError('08ab123456') !== null, true)
cek('telepon terlalu pendek', phoneError('0812') !== null, true)
cek('telepon dengan kurung/strip', phoneError('(021) 555-1234'), null)
cek('telepon kosong boleh', phoneError(null), null)

// Nilai Rupiah dari form
cek('nilai kosong = 0', parseValue(''), 0)
cek('nilai bulat', parseValue('2500000'), 2500000)
cek('nilai desimal', parseValue('1500.50'), 1500.5)
cek('nilai negatif ditolak', typeof parseValue('-5'), 'string')
cek('nilai huruf ditolak', typeof parseValue('1jt'), 'string')
cek('nilai pemisah ribuan ditolak', typeof parseValue('1.500.000'), 'string')
cek('nilai terlalu besar ditolak', typeof parseValue('1' + '0'.repeat(15)), 'string')

// Transisi tahap
const OPEN: LeadStage[] = ['LEAD', 'POTENSIAL', 'PROPOSAL', 'NEGOSIASI']
for (const s of OPEN) {
  cek(`${s} bisa ke 5 tahap lain`, allowedTargets(s).length, 5)
  cek(`${s} tidak ke diri sendiri`, canMove(s, s), false)
}
cek('Lead ke Potensial', canMove('LEAD', 'POTENSIAL'), true)
cek('Negosiasi mundur ke Proposal', canMove('NEGOSIASI', 'PROPOSAL'), true)
cek('Deal final', allowedTargets('DEAL'), [])
cek('Batal hanya dibuka ke Lead', allowedTargets('BATAL'), ['LEAD'])
cek('Batal tidak langsung ke Deal', canMove('BATAL', 'DEAL'), false)

// Pindah tahap + alasan batal
cek('batal tanpa alasan', stageChangeError('PROPOSAL', 'BATAL', null), 'Alasan batal wajib diisi.')
cek('batal alasan spasi', stageChangeError('PROPOSAL', 'BATAL', '   ') !== null, true)
cek('batal dengan alasan', stageChangeError('PROPOSAL', 'BATAL', 'Anggaran ditunda'), null)
cek('Deal tidak bisa dibatalkan', stageChangeError('DEAL', 'BATAL', 'x') !== null, true)
cek('tahap sama ditolak', stageChangeError('LEAD', 'LEAD', null) !== null, true)
cek('buka lagi dari Batal', stageChangeError('BATAL', 'LEAD', null), null)

// Ringkasan
const sum = summarize([
  { stage: 'LEAD', estimated_value: 100 },
  { stage: 'LEAD', estimated_value: 50.5 },
  { stage: 'DEAL', estimated_value: 900 },
])
cek('ringkasan 6 tahap berurutan', sum.map((s) => s.stage), ['LEAD', 'POTENSIAL', 'PROPOSAL', 'NEGOSIASI', 'DEAL', 'BATAL'])
cek('ringkasan Lead', sum[0], { stage: 'LEAD', count: 2, total: 150.5 })
cek('ringkasan tahap kosong', sum[5], { stage: 'BATAL', count: 0, total: 0 })

console.log(`LULUS: ${ok}`)
console.log(`GAGAL: ${gagal}`)
if (gagal > 0) process.exit(1)
