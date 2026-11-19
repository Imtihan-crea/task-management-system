/**
 * Uji lib/export/excel.ts — tata letak gaya TEMPLATE STANDAR KASUAT, tipe sel,
 * nama tab, dan header unduhan. Berkas ditulis lalu dibaca ulang.
 * Jalankan: npm run test:export-excel
 */
import readXlsxFile from 'read-excel-file/node'
import { buildSheet, excelDate, excelResponse, hoursOf, sheetName } from '../lib/export/excel'

let ok = 0
let gagal = 0
function cek(label: string, aktual: unknown, harap: unknown): void {
  if (JSON.stringify(aktual) === JSON.stringify(harap)) ok++
  else {
    gagal++
    console.log(`  [GAGAL] ${label} -> ${JSON.stringify(aktual)} (harus ${JSON.stringify(harap)})`)
  }
}

type Row = { nama: string; tgl: string; menit: number; catatan: string | null }
const rows: Row[] = [
  { nama: 'Contoh Satu', tgl: '2026-11-03', menit: 90, catatan: null },
  { nama: 'Contoh Dua', tgl: '2026-11-04', menit: 20, catatan: 'ok' },
]
const sheet = {
  name: 'Daily Data: Nov/2026 dan nama yang sangat panjang',
  title: 'DAILY DATA 2026-11',
  info: ['Bulan: 2026-11', 'Diekspor oleh Penguji'],
  columns: [
    { header: 'Nama', value: (r: Row) => r.nama },
    { header: 'Tanggal', value: (r: Row) => excelDate(r.tgl) },
    { header: 'Durasi (Jam)', format: '0.00', value: (r: Row) => hoursOf(r.menit) },
    { header: 'Catatan', value: (r: Row) => r.catatan },
  ],
  rows,
}

cek('nama tab dibersihkan & dipotong 31', sheetName(sheet.name), 'Daily Data- Nov-2026 dan nama y')
cek('hoursOf 2 desimal', hoursOf(20), 0.33)
cek('excelDate kosong', excelDate(null), null)
cek('stempel 23:30 UTC = besoknya di WIB', excelDate('2026-11-18T23:30:00Z')?.toISOString(), '2026-11-19T00:00:00.000Z')
cek('excelDate UTC', excelDate('2026-11-03')?.toISOString(), '2026-11-03T00:00:00.000Z')

const built = buildSheet(sheet)
// judul(1) + info(2) + kosong(1) + header(1) = header di baris 5 -> beku 5 baris
cek('baris beku sampai header', built.stickyRowsCount, 5)
cek('lebar kolom default', built.columns?.map((c) => c.width), [16, 16, 16, 16])

;(async () => {
  const res = await excelResponse('Rekap Daily Tracker 2026-11 Ops/Gudang', [sheet])
  cek('content-type xlsx', res.headers.get('Content-Type'), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  cek('nama berkas aman', /filename="Rekap Daily Tracker 2026-11 Ops_Gudang\.xlsx"/.test(res.headers.get('Content-Disposition') ?? ''), true)
  const data = await readXlsxFile(Buffer.from(await res.arrayBuffer()))
  const [{ data: sheetRows, sheet: tab }] = data as unknown as { sheet: string; data: unknown[][] }[]
  cek('nama tab di berkas', tab, 'Daily Data- Nov-2026 dan nama y')
  cek('judul di A1', sheetRows[0][0], 'DAILY DATA 2026-11')
  cek('info di A2', sheetRows[1][0], 'Bulan: 2026-11')
  cek('header di baris 5', sheetRows[4], ['Nama', 'Tanggal', 'Durasi (Jam)', 'Catatan'])
  cek('angka tetap angka', sheetRows[5][2], 1.5)
  cek('tanggal jadi tanggal', (sheetRows[5][1] as Date).toISOString?.().slice(0, 10), '2026-11-03')
  cek('sel kosong', sheetRows[5][3], null)
  cek('jumlah baris data', sheetRows.length - 5, 2)
  console.log(`export-excel: ${ok} lulus, ${gagal} gagal`)
  if (gagal) process.exit(1)
})()
