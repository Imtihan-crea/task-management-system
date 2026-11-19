import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { ExcelSheet } from '@/lib/export/excel'
import { textTable } from '@/lib/export/table'

const NAVY: [number, number, number] = [0x1f, 0x38, 0x64]
const MARGIN = 28

/** PDF landscape A4: satu sheet = satu bagian (judul, info, tabel; header tabel diulang tiap halaman). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- tiap sheet punya tipe baris sendiri
export function pdfBuffer(sheets: ExcelSheet<any>[]): Buffer {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' })
  sheets.forEach((s, i) => {
    if (i > 0) doc.addPage()
    let y = MARGIN + 6
    doc.setFont('helvetica', 'bold').setFontSize(14).setTextColor(0)
    doc.text(s.title, MARGIN, y)
    doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(89)
    for (const line of s.info ?? []) doc.text(line, MARGIN, (y += 13))
    const { head, body } = textTable(s)
    // Tabel lebar: makin banyak kolom, makin kecil huruf.
    const fontSize = head.length > 12 ? 6 : head.length > 8 ? 7 : 8
    autoTable(doc, {
      head: [head],
      body,
      startY: y + 10,
      margin: { left: MARGIN, right: MARGIN, bottom: MARGIN },
      showHead: 'everyPage',
      styles: { font: 'helvetica', fontSize, cellPadding: 3, overflow: 'linebreak' },
      headStyles: { fillColor: NAVY, textColor: 255, fontStyle: 'bold' },
      columnStyles: Object.fromEntries(
        s.columns.map((c, n) => [n, s.rows.length && typeof c.value(s.rows[0]) === 'number' ? { halign: 'right' as const } : {}]),
      ),
    })
  })
  const pages = doc.getNumberOfPages()
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p).setFont('helvetica', 'normal').setFontSize(8).setTextColor(120)
    doc.text(`Halaman ${p} dari ${pages}`, doc.internal.pageSize.getWidth() - MARGIN, doc.internal.pageSize.getHeight() - 14, { align: 'right' })
  }
  return Buffer.from(doc.output('arraybuffer'))
}
