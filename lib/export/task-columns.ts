import { excelDate, type ExcelColumn } from '@/lib/export/excel'

/** Baris task untuk export: dipakai /tasks/export dan /projects/[id]/export/tasks. */
export type ExportTaskRow = {
  code: string
  title: string
  project: string
  workstream: string
  assignee: string
  status: string
  priority: string
  start_date: string | null
  deadline: string
  completed_at: string | null
  created_at: string
}

/** Label status/prioritas sama dengan badge di UI. */
export { taskStatusLabel as statusLabel } from '@/lib/auth/roles'

/** ISO timestamp -> tanggal kalender WIB (bukan UTC), sama dengan filter tanggal di halaman. */
export function wibDate(iso: string | null | undefined): Date | null {
  if (!iso) return null
  const t = new Date(iso)
  if (Number.isNaN(t.getTime())) return null
  return excelDate(new Date(t.getTime() + 7 * 3600_000).toISOString())
}

export function taskColumns(opts: { withProject: boolean }): ExcelColumn<ExportTaskRow>[] {
  const cols: ExcelColumn<ExportTaskRow>[] = [
    { header: 'Kode', width: 10, value: (r) => r.code },
    { header: 'Judul', width: 40, value: (r) => r.title },
    { header: 'Project', width: 28, value: (r) => r.project },
    { header: 'Workstream', width: 28, value: (r) => r.workstream },
    { header: 'PIC', width: 22, value: (r) => r.assignee },
    { header: 'Status', width: 14, value: (r) => r.status },
    { header: 'Prioritas', width: 11, value: (r) => r.priority },
    { header: 'Mulai', width: 12, value: (r) => excelDate(r.start_date) },
    { header: 'Deadline', width: 12, value: (r) => excelDate(r.deadline) },
    { header: 'Selesai', width: 12, value: (r) => (r.status === 'DONE' ? wibDate(r.completed_at) : null) },
    { header: 'Dibuat', width: 12, value: (r) => wibDate(r.created_at) },
  ]
  return opts.withProject ? cols : cols.filter((c) => c.header !== 'Project')
}
