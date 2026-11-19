import type { ExcelColumn, ExcelSheet } from '@/lib/export/excel'

/** Teks sel untuk PDF/Word: tanggal dd/mm/yyyy, angka mengikuti jumlah desimal format kolom ('0.00' -> 2). */
export function cellText(value: string | number | Date | null | undefined, format?: string): string {
  if (value === null || value === undefined || value === '') return ''
  if (value instanceof Date) {
    const d = value.toISOString()
    return `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`
  }
  if (typeof value === 'number') {
    const decimals = format?.split('.')[1]?.replace(/[^0#]/g, '').length ?? 0
    const min = format?.split('.')[1]?.replace(/[^0]/g, '').length ?? 0
    return value.toLocaleString('id-ID', { minimumFractionDigits: min, maximumFractionDigits: decimals })
  }
  return value
}

export type TextTable = { head: string[]; body: string[][] }

export function textTable<T>(s: ExcelSheet<T>): TextTable {
  const cols: ExcelColumn<T>[] = s.columns
  return {
    head: cols.map((c) => c.header),
    body: s.rows.map((r) => cols.map((c) => cellText(c.value(r), c.format))),
  }
}
