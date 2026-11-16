import type { TaskStatus } from '@/types/task'
import { fieldMax } from '@/lib/forms/limits'

/**
 * Parser sheet "Timeline" format Excel timeline harian marketing
 * (kolom: No, Divisi, Task, Jenis, PIC (peran), Nama PIC, Mulai, Deadline,
 * Progres manual %, Status, Tgl Selesai, Catatan / update).
 * Murni (tanpa DB) supaya bisa dites; pencocokan user/workstream ada di action.
 */

export const TIMELINE_SHEET = 'Timeline'

export type TimelineRow = {
  /** Nomor baris di Excel (1-based), untuk pesan error. */
  excelRow: number
  divisi: string
  title: string
  jenis: string
  picName: string
  startDate: string | null
  deadline: string
  status: TaskStatus
  completedDate: string | null
  description: string | null
}

export type TimelineParseResult = {
  rows: TimelineRow[]
  errors: string[]
}

type Cell = string | number | boolean | Date | null | undefined

const STATUS_MAP: Record<string, TaskStatus> = {
  'belum mulai': 'TODO',
  berjalan: 'IN_PROGRESS',
  ditahan: 'BLOCKED',
  selesai: 'DONE',
  batal: 'CANCELLED',
}

const text = (v: Cell) => (v === null || v === undefined ? '' : String(v).trim())

const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase()
/** Kunci pencocokan task hasil import: Divisi + judul (judul sama boleh di divisi lain). */
export const importKey = (divisi: string, title: string) => `${norm(divisi)}|${norm(title)}`

/** Date, angka serial Excel, atau teks YYYY-MM-DD / DD/MM/YYYY → 'YYYY-MM-DD'. */
export function toDateInput(v: Cell): string | null | 'invalid' {
  if (v === null || v === undefined || v === '') return null
  let d: Date | null = null
  if (v instanceof Date) d = v
  else if (typeof v === 'number') d = new Date(Math.round((v - 25569) * 86400000))
  else if (typeof v === 'string') {
    const s = v.trim()
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (m) d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]))
    m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
    if (m) d = new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]))
  }
  if (!d || Number.isNaN(d.getTime())) return 'invalid'
  return d.toISOString().slice(0, 10)
}

const REQUIRED = ['Divisi', 'Task', 'Nama PIC', 'Mulai', 'Deadline', 'Status'] as const

export function parseTimeline(data: Cell[][]): TimelineParseResult {
  const errors: string[] = []
  const headerIdx = data.findIndex((r) => r.some((c) => text(c) === 'Task') && r.some((c) => text(c) === 'Deadline'))
  if (headerIdx < 0) {
    return { rows: [], errors: ['Baris judul kolom (Task, Deadline, ...) tidak ditemukan di sheet Timeline.'] }
  }
  const header = data[headerIdx].map(text)
  const col = (name: string) => header.findIndex((h) => h.toLowerCase().startsWith(name.toLowerCase()))
  const missing = REQUIRED.filter((n) => col(n) < 0)
  if (missing.length) return { rows: [], errors: [`Kolom tidak ditemukan: ${missing.join(', ')}.`] }

  const c = {
    divisi: col('Divisi'),
    title: col('Task'),
    jenis: col('Jenis'),
    peran: col('PIC (peran)'),
    pic: col('Nama PIC'),
    start: col('Mulai'),
    deadline: col('Deadline'),
    progress: col('Progres manual'),
    status: col('Status'),
    done: col('Tgl Selesai'),
    note: col('Catatan'),
  }
  const at = (r: Cell[], i: number) => (i < 0 ? null : r[i])

  const rows: TimelineRow[] = []
  const seen = new Map<string, number>()
  data.slice(headerIdx + 1).forEach((r, i) => {
    const excelRow = headerIdx + 2 + i
    const title = text(at(r, c.title))
    if (!title) return // baris kosong / sisa rumus
    const err = (m: string) => errors.push(`Baris ${excelRow} (${title}): ${m}`)

    const divisi = text(at(r, c.divisi))
    const key = importKey(divisi, title)
    const prev = seen.get(key)
    if (prev) return err(`task dan Divisi sama dengan baris ${prev}.`)
    seen.set(key, excelRow)

    const picName = text(at(r, c.pic)) || text(at(r, c.peran))
    const startDate = toDateInput(at(r, c.start))
    const deadline = toDateInput(at(r, c.deadline))
    const completedDate = toDateInput(at(r, c.done))
    const statusText = text(at(r, c.status)).toLowerCase()
    const progress = Number(at(r, c.progress)) || 0

    if (!divisi) return err('Divisi kosong.')
    if (title.length > fieldMax('title')) return err(`judul lebih dari ${fieldMax('title')} karakter.`)
    if (divisi.length > fieldMax('name')) return err(`Divisi lebih dari ${fieldMax('name')} karakter.`)
    if (!picName) return err('Nama PIC kosong.')
    if (!deadline) return err('Deadline kosong.')
    if (startDate === 'invalid' || deadline === 'invalid' || completedDate === 'invalid') {
      return err('format tanggal tidak dikenali.')
    }
    if (startDate && deadline < startDate) return err('Deadline sebelum tanggal Mulai.')
    if (statusText && !STATUS_MAP[statusText]) {
      return err(`Status "${text(at(r, c.status))}" tidak dikenal (pakai Belum mulai / Berjalan / Ditahan / Selesai / Batal).`)
    }

    let status: TaskStatus = STATUS_MAP[statusText] ?? 'TODO'
    // Sama dengan aturan Excel: progres 100% dianggap selesai kecuali Batal.
    if (progress >= 1 && status !== 'CANCELLED') status = 'DONE'

    const jenis = text(at(r, c.jenis))
    const peran = text(at(r, c.peran))
    const note = text(at(r, c.note))
    const description = [
      jenis && `Jenis: ${jenis}`,
      `PIC: ${picName}${peran && peran !== picName ? ` (${peran})` : ''}`,
      progress > 0 && progress < 1 && `Progres: ${Math.round(progress * 100)}%`,
      note && `Catatan: ${note}`,
    ].filter(Boolean).join('\n').slice(0, fieldMax('description'))

    rows.push({
      excelRow,
      divisi,
      title,
      jenis,
      picName,
      startDate,
      deadline,
      status,
      completedDate: status === 'DONE' ? completedDate : null,
      description: description || null,
    })
  })

  return { rows, errors }
}
