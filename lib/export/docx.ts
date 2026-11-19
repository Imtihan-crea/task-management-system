import {
  Document, HeadingLevel, Packer, PageOrientation, Paragraph, ShadingType, Table, TableCell, TableRow, TextRun, WidthType,
} from 'docx'
import type { ExcelSheet } from '@/lib/export/excel'
import { textTable } from '@/lib/export/table'

const NAVY = '1F3864'

/** Word landscape A4: satu sheet = satu bagian (judul, info, tabel; baris header diulang tiap halaman). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- tiap sheet punya tipe baris sendiri
export async function docxBuffer(sheets: ExcelSheet<any>[]): Promise<Buffer> {
  const page = { size: { orientation: PageOrientation.LANDSCAPE, width: 11906, height: 16838 }, margin: { top: 720, bottom: 720, left: 720, right: 720 } }
  const doc = new Document({
    styles: { default: { document: { run: { font: 'Arial', size: 18 } } } },
    sections: sheets.map((s) => {
      const { head, body } = textTable(s)
      const cell = (text: string, header = false) =>
        new TableCell({
          children: [new Paragraph({ children: [new TextRun({ text, bold: header, color: header ? 'FFFFFF' : undefined, size: head.length > 8 ? 14 : 16 })] })],
          shading: header ? { type: ShadingType.CLEAR, color: 'auto', fill: NAVY } : undefined,
        })
      return {
        properties: { page },
        children: [
          new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: s.title, bold: true, size: 28 })] }),
          ...(s.info ?? []).map((line) => new Paragraph({ children: [new TextRun({ text: line, color: '595959', size: 18 })] })),
          new Paragraph({ text: '' }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({ tableHeader: true, cantSplit: true, children: head.map((h) => cell(h, true)) }),
              ...body.map((r) => new TableRow({ cantSplit: true, children: r.map((t) => cell(t)) })),
            ],
          }),
        ],
      }
    }),
  })
  return Packer.toBuffer(doc)
}
