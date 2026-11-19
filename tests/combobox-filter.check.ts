/**
 * Uji lib/utils/combobox-filter.ts — penyaring daftar Combobox.
 * Jalankan: npm run test:combobox
 */
import { filterOptions } from '../lib/utils/combobox-filter'

let gagal = 0
function cek(label: string, aktual: unknown, harap: unknown): void {
  if (JSON.stringify(aktual) !== JSON.stringify(harap)) {
    gagal++
    console.log(`  [GAGAL] ${label} -> ${JSON.stringify(aktual)} (harus ${JSON.stringify(harap)})`)
  }
}

const daftar = ['Rapat Mingguan', 'Pengembangan ERP', 'Perapihan Gudang', 'Meeting Klien']
cek('kosong = semua', filterOptions(daftar, ''), daftar)
cek('spasi saja = semua', filterOptions(daftar, '  '), daftar)
cek('abaikan huruf besar', filterOptions(daftar, 'ERP'), ['Pengembangan ERP'])
cek('cocok di tengah kata', filterOptions(daftar, 'apat'), ['Rapat Mingguan'])
cek('awalan lebih dulu', filterOptions(daftar, 'ra'), ['Rapat Mingguan', 'Perapihan Gudang'])
cek('tak ada cocok', filterOptions(daftar, 'zzz'), [])

if (gagal) {
  console.log(`${gagal} uji gagal`)
  process.exit(1)
}
console.log('combobox-filter: semua uji lulus')
