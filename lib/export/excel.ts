import writeXlsxFile, { type Cell, type Sheet } from 'write-excel-file/node'
import { appDateOf } from '@/lib/utils/dates'

/**
 * Export Excel bergaya TEMPLATE STANDAR KASUAT v0.2: judul tebal di baris 1,
 * info filter di bawahnya, satu baris kosong, header navy berteks putih yang
 * dibekukan. Semua tombol "Export Excel" memakai fungsi ini.
 */

type CellValue = string | number | Date | null | undefined

export type ExcelColumn<T> = {
  header: string
  /** Lebar kolom dalam karakter. */
  width?: number
  value: (row: T) => CellValue
  /** Format angka/tanggal Excel, mis. '0.00' atau 'dd/mm/yyyy'. */
  format?: string
}

export type ExcelSheet<T> = {
  /** Nama tab (maks 31 karakter). */
  name: string
  title: string
  /** Baris keterangan di bawah judul, mis. "Bulan: 2026-11". */
  info?: string[]
  columns: ExcelColumn<T>[]
  rows: T[]
}

const NAVY = '#1F3864'
const FONT_SIZE = 10

/** Tanggal ISO (YYYY-MM-DD) atau stempel waktu -> Date UTC supaya Excel menyimpannya sebagai tanggal, bukan teks. */
export function excelDate(iso: string | null | undefined): Date | null {
  if (!iso) return null
  // Stempel waktu (created_at, decided_at) -> tanggal WIB; memotong 10 karakter UTC bisa mundur sehari.
  const day = iso.length > 10 ? appDateOf(iso) : iso
  const d = new Date(`${day}T00:00:00Z`)
  return Number.isNaN(d.getTime()) ? null : d
}

/** Menit -> jam desimal (2 angka). */
export const hoursOf = (minutes: number) => Math.round((minutes / 60) * 100) / 100

function cell(value: CellValue, format?: string): Cell {
  if (value === null || value === undefined || value === '') return null
  if (value instanceof Date) return { value, type: Date, format: format ?? 'dd/mm/yyyy', fontSize: FONT_SIZE }
  if (typeof value === 'number') return { value, type: Number, format, fontSize: FONT_SIZE }
  return { value, type: String, fontSize: FONT_SIZE, wrap: true }
}

/** Nama tab Excel: maks 31 karakter, tanpa []:*?/\ */
export const sheetName = (name: string) => name.replace(/[[\]:*?/\\]/g, '-').slice(0, 31)

export function buildSheet<T>(s: ExcelSheet<T>): Sheet<Buffer> {
  const width = Math.max(s.columns.length, 1)
  const pad = (row: Cell[]) => [...row, ...Array<Cell>(width - row.length).fill(null)]
  const data: Cell[][] = [
    pad([{ value: s.title, type: String, fontWeight: 'bold', fontSize: 14 }]),
    ...(s.info ?? []).map((line) => pad([{ value: line, type: String, fontSize: FONT_SIZE, textColor: '#595959' }])),
    pad([]),
    s.columns.map((c) => ({
      value: c.header,
      type: String,
      fontWeight: 'bold' as const,
      fontSize: FONT_SIZE,
      textColor: '#FFFFFF',
      backgroundColor: NAVY,
      alignVertical: 'center' as const,
      wrap: true,
    })),
    ...s.rows.map((r) => s.columns.map((c) => cell(c.value(r), c.format))),
  ]
  const headerRow = 2 + (s.info?.length ?? 0) + 1 // judul + info + baris kosong + header
  return {
    data,
    sheet: sheetName(s.name),
    columns: s.columns.map((c) => ({ width: c.width ?? 16 })),
    stickyRowsCount: headerRow,
  }
}

/** Info baku: waktu export (WIB) dan pengunduh. */
export function exportInfo(by: string, extra: string[] = []): string[] {
  const at = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'medium', timeStyle: 'short' })
  return [...extra, `Diekspor ${at} WIB oleh ${by}`]
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- tiap sheet punya tipe baris sendiri
export async function excelResponse(fileName: string, sheets: ExcelSheet<any>[]): Promise<Response> {
  const buffer = await writeXlsxFile(sheets.map(buildSheet), { fontFamily: 'Arial', fontSize: FONT_SIZE }).toBuffer()
  const safe = fileName.replace(/[^\w .()-]/g, '_')
  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${safe}.xlsx"; filename*=UTF-8''${encodeURIComponent(fileName)}.xlsx`,
      'Cache-Control': 'no-store',
    },
  })
}
