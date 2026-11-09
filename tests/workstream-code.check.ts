/**
 * Uji lib/workstreams/code.ts — kode Workstream berikutnya tahan lubang.
 * Jalankan: npm run test:ws-code
 */
import { numToLetters, lettersToNum, nextWorkstreamCode } from '../lib/workstreams/code'

let ok = 0
let gagal = 0
function cek(label: string, aktual: unknown, harap: unknown): void {
  if (JSON.stringify(aktual) === JSON.stringify(harap)) ok++
  else {
    gagal++
    console.log(`  [GAGAL] ${label} -> ${JSON.stringify(aktual)} (harus ${JSON.stringify(harap)})`)
  }
}

for (const [n, s] of [[1, 'A'], [26, 'Z'], [27, 'AA'], [52, 'AZ'], [53, 'BA'], [702, 'ZZ'], [703, 'AAA']] as const) {
  cek(`numToLetters(${n})`, numToLetters(n), s)
  cek(`lettersToNum(${s})`, lettersToNum(s), n)
}
cek('kosong', nextWorkstreamCode([]), 'A')
cek('A,B,C', nextWorkstreamCode(['A', 'B', 'C']), 'D')
cek('hapus A dari A,B,C (bug lama: C)', nextWorkstreamCode(['B', 'C']), 'D')
cek('hapus tengah', nextWorkstreamCode(['A', 'C']), 'D')
cek('Z -> AA', nextWorkstreamCode(['Z', 'A']), 'AA')
cek('abaikan kode aneh', nextWorkstreamCode(['A', 'x1']), 'B')

console.log(`LULUS: ${ok}`)
console.log(`GAGAL: ${gagal}`)
if (gagal > 0) process.exit(1)
