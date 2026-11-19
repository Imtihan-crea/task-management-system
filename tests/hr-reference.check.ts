/**
 * Uji lib/hr/reference.ts — Master Reference (migrasi 022).
 * Jalankan: npm run test:hr-reference
 */
import {
  attrChanges, codeFromLabel, duplicateLabel, isReferenceList, parseMaxDays, REFERENCE_LISTS, groupFreeText, labelError, nextSortOrder, renameError, resolveChoice, type ReferenceRow,
} from '../lib/hr/reference'

let ok = 0
let gagal = 0
function cek(label: string, aktual: unknown, harap: unknown): void {
  if (JSON.stringify(aktual) === JSON.stringify(harap)) ok++
  else {
    gagal++
    console.log(`  [GAGAL] ${label} -> ${JSON.stringify(aktual)} (harus ${JSON.stringify(harap)})`)
  }
}

const row = (id: string, label: string, archived = false, code = id.toUpperCase()): ReferenceRow => ({
  id, list: 'ACTIVITY_CATEGORY', code, label, description: null, sort_order: 10, archived_at: archived ? '2026-11-16T00:00:00Z' : null,
})
const rows = [row('a', 'Meeting'), row('b', 'Focus Work'), row('c', 'Perjalanan Lama', true)]

// Label
cek('label kosong', labelError('   '), 'Label wajib diisi.')
cek('label 81 karakter', labelError('x'.repeat(81)) !== null, true)
cek('label sah', labelError('Meeting Klien'), null)

// Ubah label: hanya menambah
cek('tambah kata boleh', renameError('Meeting', 'Meeting Klien'), null)
cek('tambah di depan boleh', renameError('Meeting', 'Internal Meeting'), null)
cek('beda huruf besar boleh', renameError('Meeting', 'MEETING klien'), null)
cek('ganti total ditolak', renameError('Meeting', 'Rapat') !== null, true)
cek('memotong ditolak', renameError('Focus Work', 'Focus') !== null, true)
cek('spasi dirapikan', renameError('Focus Work', '  Focus   Work  Mandiri '), null)

// Duplikat (termasuk arsip, tanpa beda huruf)
cek('duplikat beda huruf', duplicateLabel(rows, 'meeting')?.id, 'a')
cek('duplikat dengan arsip', duplicateLabel(rows, 'perjalanan lama')?.id, 'c')
cek('bukan duplikat diri sendiri', duplicateLabel(rows, 'Meeting', 'a'), null)
cek('label baru', duplicateLabel(rows, 'Planning'), null)

// Kode
cek('kode dari label', codeFromLabel('Monitoring/Supervisi', []), 'MONITORING_SUPERVISI')
cek('kode aksen', codeFromLabel('Café Rapat', []), 'CAFE_RAPAT')
cek('kode unik', codeFromLabel('Meeting', ['MEETING', 'MEETING_2']), 'MEETING_3')
cek('kode simbol saja', codeFromLabel('///', []), 'PILIHAN')
cek('kode maks 50', codeFromLabel('a'.repeat(70), []).length, 50)
cek('urutan berikut', nextSortOrder([{ sort_order: 10 }, { sort_order: 40 }]), 50)
cek('urutan daftar kosong', nextSortOrder([]), 10)

// Cocokkan ketikan
cek('kosong', resolveChoice('  ', rows).kind, 'empty')
cek('cocok beda huruf', resolveChoice(' meeting ', rows), { kind: 'ref', ref: rows[0] })
cek('cocok arsip', resolveChoice('Perjalanan lama', rows).kind, 'archived')
cek('teks bebas dirapikan', resolveChoice('  Rapat   vendor ', rows), { kind: 'free', text: 'Rapat vendor' })

// Usulan teks bebas
cek('kelompok usulan', groupFreeText([
  { text: 'Rapat vendor', date: '2026-11-01' },
  { text: 'rapat  VENDOR', date: '2026-11-05' },
  { text: 'Gudang', date: '2026-11-02' },
  { text: '  ', date: '2026-11-03' },
]), [
  { text: 'Rapat vendor', count: 2, lastDate: '2026-11-05' },
  { text: 'Gudang', count: 1, lastDate: '2026-11-02' },
])

// Jenis cuti (migrasi 027)
cek('LEAVE_TYPE adalah daftar', isReferenceList('LEAVE_TYPE'), true)
cek('tab terakhir = Jenis cuti', REFERENCE_LISTS[REFERENCE_LISTS.length - 1].list, 'LEAVE_TYPE')
cek('tab: 6 daftar', REFERENCE_LISTS.length, 6)
cek('max_days kosong = tanpa batas', parseMaxDays(' '), { value: null })
cek('max_days 5', parseMaxDays('5'), { value: 5 })
cek('max_days 0 ditolak', 'error' in parseMaxDays('0'), true)
cek('max_days 367 ditolak', 'error' in parseMaxDays('367'), true)
cek('max_days desimal ditolak', 'error' in parseMaxDays('2.5'), true)
cek('max_days teks ditolak', 'error' in parseMaxDays('abc'), true)
const a0 = { counts_hours: true, uses_quota: false, max_days: null }
cek('tanpa perubahan atribut', attrChanges(a0, a0), '')
cek('perubahan atribut tercatat', attrChanges(a0, { counts_hours: false, uses_quota: true, max_days: 3 }), 'dihitung jam kerja: ya jadi tidak; memotong jatah: tidak jadi ya; batas hari: tanpa batas jadi 3 hari')

console.log(`hr-reference: ${ok} lulus, ${gagal} gagal`)
if (gagal) process.exit(1)
