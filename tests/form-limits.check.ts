/** Uji lib/forms/limits.ts (audit B12). Jalankan: npm run test:limits */
import { readLimitedField, fieldMax, FieldTooLongError } from '../lib/forms/limits'

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

cek('trim', readLimitedField(fd, 'title'), 'Judul')
cek('tidak ada -> kosong', readLimitedField(fd, 'missing'), '')
cek('bukan string -> kosong', readLimitedField(fd, 'file'), '')
cek('tepat di batas lolos', readLimitedField(fd, 'notes').length, 20000)
cek('lewat batas description dilempar', lempar(() => readLimitedField(fd, 'description')), true)
cek('field tak dikenal pakai default 500', lempar(() => readLimitedField(fd, 'status')), true)
cek('fieldMax title', fieldMax('title'), 300)

console.log(`LULUS: ${ok}`)
console.log(`GAGAL: ${gagal}`)
if (gagal > 0) process.exit(1)
