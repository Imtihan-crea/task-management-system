/**
 * Uji lib/data/filter-values.ts — filter URL mustahil tidak boleh sampai ke PostgREST.
 * Jalankan: npm run test:filter-values
 */
import { hasImpossibleFilter } from '../lib/data/filter-values'

let ok = 0
let gagal = 0
function cek(label: string, aktual: unknown, harap: unknown): void {
  if (JSON.stringify(aktual) === JSON.stringify(harap)) ok++
  else {
    gagal++
    console.log(`  [GAGAL] ${label} -> ${JSON.stringify(aktual)} (harus ${JSON.stringify(harap)})`)
  }
}

const ID = '3f2b8c1e-0a4d-4e6f-9b7a-1c2d3e4f5a6b'
cek('kosong = boleh', hasImpossibleFilter({}), false)
cek('uuid valid', hasImpossibleFilter({ ids: [ID, '', undefined] }), false)
cek('uuid tidak valid', hasImpossibleFilter({ ids: ['abc'] }), true)
cek('uuid terpotong', hasImpossibleFilter({ ids: [ID.slice(0, 30)] }), true)
cek('status valid', hasImpossibleFilter({ status: 'TODO' }), false)
cek('status tidak valid', hasImpossibleFilter({ status: 'todo' }), true)
cek('prioritas valid', hasImpossibleFilter({ priority: 'HIGH' }), false)
cek('prioritas tidak valid', hasImpossibleFilter({ priority: 'URGENT' }), true)

console.log(`LULUS: ${ok}`)
console.log(`GAGAL: ${gagal}`)
if (gagal > 0) process.exit(1)
