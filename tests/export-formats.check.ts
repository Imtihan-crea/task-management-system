/**
 * Uji lib/export (PDF, Word, pintu tunggal exportResponse) dengan definisi ExcelSheet yang sama dengan Excel.
 * Jalankan: npm run test:export-formats
 */
import { unzipSync } from 'fflate'
import { exportResponse } from '../lib/export'
import { excelDate, hoursOf } from '../lib/export/excel'
import { cellText } from '../lib/export/table'
import { pdfSafe } from '../lib/export/pdf'

let ok = 0
let gagal = 0
function cek(label: string, aktual: unknown, harap: unknown): void {
  if (JSON.stringify(aktual) === JSON.stringify(harap)) ok++
  else {
    gagal++
    console.log(`  [GAGAL] ${label} -> ${JSON.stringify(aktual)} (harus ${JSON.stringify(harap)})`)
  }
}

type Row = { nama: string; tgl: string; menit: number }
const sheet = {
  name: 'Data',
  title: 'DAILY DATA 2026-11',
  info: ['Bulan: 2026-11'],
  columns: [
    { header: 'Nama Karyawan', value: (r: Row) => r.nama },
    { header: 'Tanggal Kerja', value: (r: Row) => excelDate(r.tgl) },
    { header: 'Durasi (Jam)', format: '0.00', value: (r: Row) => hoursOf(r.menit) },
  ],
  rows: Array.from({ length: 120 }, (_, i): Row => ({ nama: `Contoh ${i}`, tgl: '2026-11-03', menit: 90 })),
}
const req = (q = '') => new Request(`http://x.test/export${q}`)

cek('tanggal dd/mm/yyyy', cellText(excelDate('2026-11-03')), '03/11/2026')
cek('angka ikut format 2 desimal', cellText(1.5, '0.00'), '1,50')
cek('angka bulat tanpa format', cellText(3), '3')
cek('kosong', cellText(null), '')
cek('pdf: Latin-1 & WinAnsi tetap', pdfSafe('Rapat é – “ok” €'), 'Rapat é – “ok” €')
cek('pdf: panah & tanda diganti', pdfSafe('A → B ≥ 8 ✓'), 'A -> B >= 8 v')
cek('pdf: emoji & aksara lain jadi ?', pdfSafe('Selesai 🎉 日本'), 'Selesai ? ??')

;(async () => {
  const xlsx = await exportResponse(req(), 'Uji', [sheet])
  cek('default xlsx', xlsx.headers.get('Content-Type'), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')

  const pdf = await exportResponse(req('?format=pdf'), 'Uji Rekap/1', [sheet])
  cek('pdf content-type', pdf.headers.get('Content-Type'), 'application/pdf')
  cek('pdf ekstensi', /filename="Uji Rekap_1\.pdf"/.test(pdf.headers.get('Content-Disposition') ?? ''), true)
  const pdfBytes = Buffer.from(await pdf.arrayBuffer())
  cek('pdf diawali %PDF', pdfBytes.subarray(0, 4).toString(), '%PDF')
  cek('pdf banyak halaman (header diulang)', (pdfBytes.toString('latin1').match(/\/Type\s*\/Page\b/g) ?? []).length > 1, true)

  const docx = await exportResponse(req('?format=docx'), 'Uji', [sheet])
  cek('docx content-type', docx.headers.get('Content-Type'), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
  cek('docx ekstensi', /filename="Uji\.docx"/.test(docx.headers.get('Content-Disposition') ?? ''), true)
  const xml = Buffer.from(unzipSync(new Uint8Array(await docx.arrayBuffer()))['word/document.xml']).toString()
  cek('docx memuat judul', xml.includes('DAILY DATA 2026-11'), true)
  cek('docx memuat header kolom', xml.includes('Nama Karyawan') && xml.includes('Durasi (Jam)'), true)
  cek('docx tanggal Indonesia', xml.includes('03/11/2026'), true)
  cek('docx header tabel diulang', xml.includes('w:tblHeader'), true)

  const bad = await exportResponse(req('?format=csv'), 'Uji', [sheet])
  cek('format tak dikenal -> 400', bad.status, 400)

  const empty = await exportResponse(req('?format=pdf'), 'Kosong', [{ ...sheet, rows: [] }])
  cek('pdf tanpa baris tetap jalan', empty.status, 200)

  console.log(`export-formats: ${ok} lulus, ${gagal} gagal`)
  if (gagal) process.exit(1)
})()
