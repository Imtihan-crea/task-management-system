import Link from 'next/link'
import { loadProjectTasks, type ProjectTaskRow } from '@/lib/data/project-tasks'
import { ExportLink } from '@/components/export/ExportLink'
import { PriorityBadge, TaskStatusBadge, OverdueBadge } from '@/components/ui/Badges'
import { showsOverdueBadge } from '@/lib/utils/dates'
import type { UserRole } from '@/types/profile'

export async function TasksTab({
  projectId,
  canCreate,
  filters,
  viewer,
}: {
  projectId: string
  canCreate: boolean
  filters: { ws: string; status: string; priority: string }
  /** Audit B1: daftar dan link mengikuti aturan baca /tasks/[id]. */
  viewer: { id: string; role: UserRole; managesProject: boolean }
}) {
  const { wsList, wsNames, assigneeNames, visibleTasks } = await loadProjectTasks(projectId, viewer, filters)
  const exportParams = new URLSearchParams()
  if (filters.ws) exportParams.set('ws', filters.ws)
  if (filters.status) exportParams.set('status', filters.status)
  if (filters.priority) exportParams.set('priority', filters.priority)
  const exportQs = exportParams.toString()
  const rowCls =
    'flex flex-col gap-1 rounded-lg px-2 py-2.5 sm:flex-row sm:items-center sm:justify-between'
  // PM project lain hanya bisa membuka task yang di-assign kepadanya.
  const canOpen = (t: ProjectTaskRow) =>
    viewer.role !== 'PROJECT_MANAGER' || viewer.managesProject || t.assignee_id === viewer.id

  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm sm:p-5 dark:bg-zinc-900">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold">Tasks ({visibleTasks.length})</h2>
        <div className="flex flex-wrap items-center gap-2">
          {canCreate && (
            <Link
              href={`/tasks/new?project=${projectId}`}
              className="inline-flex min-h-[44px] items-center rounded-lg bg-kasuat-gold px-4 py-2 text-sm font-semibold text-kasuat-black"
            >
              + Tambah Task
            </Link>
          )}
          <ExportLink href={`/projects/${projectId}/export/tasks${exportQs ? `?${exportQs}` : ''}`} />
        </div>
      </div>

      <form method="get" className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] sm:items-end">
        <input type="hidden" name="tab" value="tasks" />
        <div className="col-span-2 sm:col-span-1">
          <label htmlFor="fws" className="mb-1 block text-xs font-medium">
            Workstream
          </label>
          <select
            id="fws"
            name="ws"
            defaultValue={filters.ws}
            className="min-h-[44px] w-full min-w-0 rounded-lg border bg-white px-2 py-2 text-base dark:bg-zinc-800"
          >
            <option value="">Semua</option>
            {wsList.map((w) => (
              <option key={w.id} value={w.id}>
                {w.code} · {w.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="fstatus" className="mb-1 block text-xs font-medium">
            Status
          </label>
          <select
            id="fstatus"
            name="status"
            defaultValue={filters.status}
            className="min-h-[44px] w-full min-w-0 rounded-lg border bg-white px-2 py-2 text-base dark:bg-zinc-800"
          >
            <option value="">Semua</option>
            {(['TODO', 'IN_PROGRESS', 'REVIEW', 'BLOCKED', 'DONE', 'CANCELLED'] as const).map((s) => (
              <option key={s} value={s}>
                {s.replace('_', ' ')}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="fpriority" className="mb-1 block text-xs font-medium">
            Prioritas
          </label>
          <select
            id="fpriority"
            name="priority"
            defaultValue={filters.priority}
            className="min-h-[44px] w-full min-w-0 rounded-lg border bg-white px-2 py-2 text-base dark:bg-zinc-800"
          >
            <option value="">Semua</option>
            {(['LOW', 'MEDIUM', 'HIGH'] as const).map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="col-span-2 min-h-[44px] rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold sm:col-span-1 dark:border-zinc-700 dark:bg-transparent"
        >
          Filter
        </button>
      </form>

      {visibleTasks.length === 0 ? (
        <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">Belum ada Task.</p>
      ) : (
        <ul className="-mx-2 mt-3 divide-y divide-zinc-100 dark:divide-zinc-800">
          {visibleTasks.map((task) => {
            const body = (
              <>
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    <span className="mr-1.5 font-mono text-xs text-zinc-600 dark:text-zinc-400">{task.code}</span>
                    {task.title}
                  </p>
                  <p className="truncate text-xs text-zinc-600 dark:text-zinc-400">
                    {task.workstream_id ? (wsNames[task.workstream_id] ?? '-') : 'Tanpa Workstream'}
                    {' '} &middot; {assigneeNames[task.assignee_id] ?? '-'}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <PriorityBadge priority={task.priority} />
                  <TaskStatusBadge status={task.status} />
                  {showsOverdueBadge(task.deadline, task.status, task.completed_at, task.cancelled_at) && <OverdueBadge />}
                </div>
              </>
            )
            return (
              <li key={task.id}>
                {canOpen(task) ? (
                  <Link href={`/tasks/${task.id}`} className={`${rowCls} hover:bg-zinc-50 dark:hover:bg-zinc-800`}>
                    {body}
                  </Link>
                ) : (
                  <div className={rowCls}>{body}</div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
