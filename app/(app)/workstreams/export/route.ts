import type { NextRequest } from 'next/server'
import { requireProfile } from '@/lib/auth/session'
import { loadWorkstreams, sanitizeWorkstreamSearch } from '@/lib/data/workstream-list'
import { exportInfo, type ExcelColumn } from '@/lib/export/excel'
import { exportResponse } from '@/lib/export'
import { wibDate } from '@/lib/export/task-columns'
import { todayISO } from '@/lib/utils/dates'
import { onlySelected, selectedIds } from '@/lib/bulk'

export const dynamic = 'force-dynamic'

/** Daftar Workstreams -> Excel. Cakupan project & pencarian sama dengan halaman /workstreams. */
export async function GET(request: NextRequest) {
  const profile = await requireProfile()
  const q = sanitizeWorkstreamSearch(request.nextUrl.searchParams.get('q') ?? '').toLowerCase()
  const loaded = await loadWorkstreams(profile, q)
  const { projectNames, taskCounts } = loaded
  const picked = selectedIds(request.nextUrl.searchParams)
  const workstreams = onlySelected(loaded.workstreams, picked)

  type Row = (typeof workstreams)[number]
  const columns: ExcelColumn<Row>[] = [
    { header: 'Kode', width: 10, value: (w) => w.code },
    { header: 'Nama', width: 36, value: (w) => w.name },
    { header: 'Project', width: 30, value: (w) => projectNames[w.project_id] ?? '' },
    { header: 'Deskripsi', width: 44, value: (w) => w.description },
    { header: 'Jumlah Task', width: 10, value: (w) => taskCounts[w.id] ?? 0 },
    { header: 'Dibuat', width: 12, value: (w) => wibDate(w.created_at) },
  ]
  const info = exportInfo(profile.full_name || profile.email, [`${workstreams.length} workstream`, ...(picked ? ['Hanya baris terpilih'] : []), ...(q ? [`Cari: ${q}`] : [])])
  return exportResponse(request, `Workstreams ${todayISO()}`, [{ name: 'Workstreams', title: 'DAFTAR WORKSTREAMS', info, columns, rows: workstreams }])
}
