import type { NextRequest } from 'next/server'
import { requireProfile } from '@/lib/auth/session'
import { loadProjectTasks, projectTaskViewer } from '@/lib/data/project-tasks'
import { excelResponse, exportInfo } from '@/lib/export/excel'
import { statusLabel, taskColumns, type ExportTaskRow } from '@/lib/export/task-columns'
import { todayISO } from '@/lib/utils/dates'

export const dynamic = 'force-dynamic'

/** Tab Tasks workspace project -> Excel. Izin & cakupan sama dengan tab itu (projectTaskViewer + loadProjectTasks). */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const profile = await requireProfile()
  const { id } = await params
  const viewer = await projectTaskViewer(profile, id)
  if (!viewer) return new Response('Tidak ditemukan', { status: 404 })

  const sp = request.nextUrl.searchParams
  const filters = { ws: sp.get('ws') ?? '', status: sp.get('status') ?? '', priority: sp.get('priority') ?? '' }
  const { wsNames, assigneeNames, visibleTasks } = await loadProjectTasks(id, viewer, filters)

  const rows: ExportTaskRow[] = visibleTasks.map((t) => ({
    code: t.code,
    title: t.title,
    project: viewer.projectLabel,
    workstream: t.workstream_id ? (wsNames[t.workstream_id] ?? '') : '',
    assignee: assigneeNames[t.assignee_id] ?? '',
    status: statusLabel(t.status),
    priority: t.priority,
    start_date: t.start_date,
    deadline: t.deadline,
    completed_at: t.completed_at,
    created_at: t.created_at,
  }))

  const f = [
    filters.ws && `Workstream: ${wsNames[filters.ws] ?? filters.ws}`,
    filters.status && `Status: ${statusLabel(filters.status)}`,
    filters.priority && `Prioritas: ${filters.priority}`,
  ].filter(Boolean)
  const info = exportInfo(profile.full_name || profile.email, [`Project: ${viewer.projectLabel}`, `${rows.length} task`, ...(f.length ? [f.join(' · ')] : [])])

  return excelResponse(`Tasks ${viewer.projectLabel.split(' · ')[0]} ${todayISO()}`, [
    { name: 'Tasks', title: `TASKS ${viewer.projectLabel.toUpperCase()}`, info, columns: taskColumns({ withProject: false }), rows },
  ])
}
