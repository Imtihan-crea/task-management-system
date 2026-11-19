import type { NextRequest } from 'next/server'
import { requireProfile } from '@/lib/auth/session'
import { parseTaskTab } from '@/components/tasks/TaskTabs'
import { loadTaskResults, parseTaskFilters } from '@/lib/data/task-results'
import { excelResponse, exportInfo } from '@/lib/export/excel'
import { statusLabel, taskColumns, type ExportTaskRow } from '@/lib/export/task-columns'
import { todayISO } from '@/lib/utils/dates'

export const dynamic = 'force-dynamic'

/** Daftar Tasks -> Excel. Cakupan data = halaman /tasks (loadTaskResults), filter & tab sama, tanpa paginasi. */
export async function GET(request: NextRequest) {
  const profile = await requireProfile()
  const filters = parseTaskFilters(request.nextUrl.searchParams, { userId: profile.id, role: profile.role }, parseTaskTab)
  const { tasks, projectNames, workstreamNames, assigneeNames } = await loadTaskResults(filters)

  const rows: ExportTaskRow[] = tasks.map((t) => ({
    code: t.code,
    title: t.title,
    project: projectNames[t.project_id] ?? '',
    workstream: t.workstream_id ? (workstreamNames[t.workstream_id] ?? '') : '',
    assignee: assigneeNames[t.assignee_id] ?? '',
    status: statusLabel(t.status),
    priority: t.priority,
    start_date: t.start_date,
    deadline: t.deadline,
    completed_at: t.completed_at,
    created_at: t.created_at,
  }))

  const f = [
    `Tab: ${filters.tab}`,
    filters.q && `Cari: ${filters.q}`,
    filters.project && `Project: ${projectNames[filters.project] ?? filters.project}`,
    filters.workstream && `Workstream: ${workstreamNames[filters.workstream] ?? filters.workstream}`,
    filters.status && `Status: ${statusLabel(filters.status)}`,
    filters.priority && `Prioritas: ${filters.priority}`,
    filters.deadline && `Deadline: ${filters.deadline}`,
  ].filter(Boolean)
  const info = exportInfo(profile.full_name || profile.email, [`${rows.length} task`, f.join(' · ')])

  return excelResponse(`Tasks ${todayISO()}`, [
    { name: 'Tasks', title: 'DAFTAR TASKS', info, columns: taskColumns({ withProject: true }), rows },
  ])
}
