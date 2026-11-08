/** Uji lib/forms/limits.ts (audit B12). Jalankan: npm run test:limits */
import { readLimitedField, fieldMax, FieldTooLongError } from '../lib/forms/limits'
import { isValidDateInput } from '../lib/forms/dates'

let ok = 0
let gagal = 0
function cek(label: string, aktual: unknown, harap: unknown): void {
  if (JSON.stringify(aktual) === JSON.stringify(harap)) ok++
  else {
    gagal++
    console.log(`  [GAGAL] ${label} -> ${JSON.stringify(aktual)} (harus ${JSON.stringify(harap)})`)
  }
}
function lempar(fn: () => unknown): boolean {
  try {
    fn()
    return false
  } catch (e) {
    return e instanceof FieldTooLongError
  }
}

const fd = new FormData()
fd.set('title', '  Judul  ')
fd.set('notes', 'x'.repeat(20000))
fd.set('description', 'x'.repeat(5001))
fd.set('status', 'x'.repeat(501))
fd.set('file', new Blob(['a']))
fd.set('review_note', 'a\r\n'.repeat(1000))

cek('trim', readLimitedField(fd, 'title'), 'Judul')
cek('tidak ada -> kosong', readLimitedField(fd, 'missing'), '')
cek('bukan string -> kosong', readLimitedField(fd, 'file'), '')
cek('tepat di batas lolos', readLimitedField(fd, 'notes').length, 20000)
cek('lewat batas description dilempar', lempar(() => readLimitedField(fd, 'description')), true)
cek('field tak dikenal pakai default 500', lempar(() => readLimitedField(fd, 'status')), true)
cek('fieldMax title', fieldMax('title'), 300)
cek('CRLF dihitung satu karakter', readLimitedField(fd, 'review_note').length, 1999)

// isValidDateInput (audit C1)
cek('tanggal valid', isValidDateInput('2026-11-08'), true)
cek('kosong valid (opsional)', isValidDateInput(''), true)
cek('29 Feb kabisat', isValidDateInput('2028-02-29'), true)
cek('29 Feb bukan kabisat', isValidDateInput('2026-02-29'), false)
cek('30 Feb ditolak', isValidDateInput('2026-02-30'), false)
cek('bulan 13 ditolak', isValidDateInput('2026-13-01'), false)
cek('teks bebas ditolak', isValidDateInput('abc 2026'), false)
cek('format lain ditolak', isValidDateInput('08/11/2026'), false)

console.log(`LULUS: ${ok}`)
console.log(`GAGAL: ${gagal}`)
if (gagal > 0) process.exit(1)
