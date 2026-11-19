import { docxBuffer } from '@/lib/export/docx'
import { excelResponse, type ExcelSheet } from '@/lib/export/excel'
import { pdfBuffer } from '@/lib/export/pdf'

export const EXPORT_FORMATS = ['xlsx', 'pdf', 'docx'] as const
export type ExportFormat = (typeof EXPORT_FORMATS)[number]

const TYPES = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
} as const

/** Satu pintu export: format dari `?format=xlsx|pdf|docx` pada URL request (kosong = xlsx, lainnya 400). Semua format memakai definisi ExcelSheet yang sama. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- tiap sheet punya tipe baris sendiri
export async function exportResponse(request: Request, fileName: string, sheets: ExcelSheet<any>[]): Promise<Response> {
  const f = new URL(request.url).searchParams.get('format') || 'xlsx'
  if (!(EXPORT_FORMATS as readonly string[]).includes(f)) {
    return Response.json({ error: `Format tidak dikenal. Pilih: ${EXPORT_FORMATS.join(', ')}.` }, { status: 400 })
  }
  if (f === 'xlsx') return excelResponse(fileName, sheets)
  const body = f === 'pdf' ? pdfBuffer(sheets) : await docxBuffer(sheets)
  const safe = fileName.replace(/[^\w .()-]/g, '_')
  return new Response(new Uint8Array(body), {
    headers: {
      'Content-Type': TYPES[f as keyof typeof TYPES],
      'Content-Disposition': `attachment; filename="${safe}.${f}"; filename*=UTF-8''${encodeURIComponent(fileName)}.${f}`,
      'Cache-Control': 'no-store',
    },
  })
}
