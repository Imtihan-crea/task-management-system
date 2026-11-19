import Link from 'next/link'
import { formatDate, isOverdue, showsOverdueBadge } from '@/lib/utils/dates'
import { PriorityBadge, TaskStatusBadge, OverdueBadge } from '@/components/ui/Badges'
import { Pagination, paginate } from '@/components/ui/Pagination'
import { loadTaskResults, type TaskFilters } from '@/lib/data/task-results'
import { EmptyState } from '@/components/ui/primitives'

export type { TaskFilters }

/**
 * Hasil task: fetch + filter + sort + paginate.
 * Dijalankan dalam Suspense boundary — hanya area ini yang loading (§12).
 */
export async function TaskResults({ filters }: { filters: TaskFilters }) {
  const { q, tab, sort, page } = filters

  // Fetch bersama TaskTabs via cache() — 1x query per request.
  const { allTasks, tasks, projectNames, workstreamNames, assigneeNames } = await loadTaskResults(filters)

  const overdueCount = tasks.filter((t) => isOverdue(t.deadline, t.status)).length
  const { pageItems, totalPages } = paginate(tasks, page, 50)
  const safePage = Math.min(page, totalPages)

  const baseParams: Record<string, string> = {}
  if (tab !== 'all') baseParams.view = tab === 'mine' ? 'mine' : tab
  if (q) baseParams.q = q
  if (filters.project) baseParams.project = filters.project
  if (filters.workstream) baseParams.workstream = filters.workstream
  if (filters.status) baseParams.status = filters.status
  if (filters.priority) baseParams.priority = filters.priority
  if (filters.deadline) baseParams.deadline = filters.deadline
  if (sort !== 'deadline.asc') baseParams.sort = sort

  if (tasks.length === 0 && allTasks.length === 0) {
    return (
      <div className="mt-4">
        <EmptyState title="Task tidak ditemukan." message="Coba pencarian, tab, atau filter lain." />
      </div>
    )
  }

  return (
    <>
      <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400" role="status">
        {tasks.length} task
        {overdueCount > 0 ? ` · ${overdueCount} Overdue` : ''}
      </p>
      <div className="scroll-x-hint mt-3 hidden overflow-x-auto rounded-2xl border border-zinc-200 md:block dark:border-zinc-800">
        <table className="w-full text-left text-sm">
          <thead className="border-b text-xs uppercase text-zinc-600 dark:text-zinc-400">
            <tr>
              <th scope="col" className="px-4 py-3">ID</th>
              <th scope="col" className="px-4 py-3">Task</th>
              <th scope="col" className="px-4 py-3">Project</th>
              <th scope="col" className="px-4 py-3">Workstream</th>
              <th scope="col" className="px-4 py-3">Assignee</th>
              <th scope="col" className="px-4 py-3">Prioritas</th>
              <th scope="col" className="px-4 py-3">Status</th>
              <th scope="col" className="px-4 py-3">Deadline</th>
            </tr>
          </thead>
          <tbody>
            {pageItems.map((task) => (
              <tr key={task.id} className="relative border-b last:border-0">
                <td className="whitespace-nowrap px-4 py-3 font-mono text-xs">{task.code}</td>
                <td className="px-4 py-3">
                  <Link
                    href={`/tasks/${task.id}`}
                    className="font-medium hover:underline after:absolute after:inset-0"
                  >
                    {task.title}
                  </Link>
                  {showsOverdueBadge(task.deadline, task.status, task.completed_at, task.cancelled_at) && (
                    <span className="ml-2"><OverdueBadge /></span>
                  )}
                </td>
                <td className="px-4 py-3">{projectNames[task.project_id] ?? '-'}</td>
                <td className="px-4 py-3">{task.workstream_id ? (workstreamNames[task.workstream_id] ?? '-') : '-'}</td>
                <td className="px-4 py-3">{assigneeNames[task.assignee_id] ?? '-'}</td>
                <td className="px-4 py-3"><PriorityBadge priority={task.priority} /></td>
                <td className="px-4 py-3"><TaskStatusBadge status={task.status} /></td>
                <td className="whitespace-nowrap px-4 py-3">{formatDate(task.deadline)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="mt-3 divide-y divide-zinc-200 overflow-hidden rounded-2xl border border-zinc-200 bg-white md:hidden dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
        {pageItems.map((task) => (
          <li key={task.id}>
            <Link
              href={`/tasks/${task.id}`}
              className="block px-3 py-2.5 active:bg-zinc-50 dark:active:bg-zinc-800"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 text-sm font-semibold leading-snug">
                  <span className="mr-1.5 font-mono text-xs font-normal text-zinc-600 dark:text-zinc-400">{task.code}</span>
                  {task.title}
                </p>
                <span className="shrink-0"><TaskStatusBadge status={task.status} /></span>
              </div>
              <p className="mt-0.5 truncate text-xs text-zinc-600 dark:text-zinc-400">
                {projectNames[task.project_id] ?? '-'} &middot;{' '}
                {task.workstream_id ? (workstreamNames[task.workstream_id] ?? '-') : 'Tanpa Workstream'} &middot;{' '}
                {assigneeNames[task.assignee_id] ?? '-'}
              </p>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-400">
                <PriorityBadge priority={task.priority} />
                {showsOverdueBadge(task.deadline, task.status, task.completed_at, task.cancelled_at) && <OverdueBadge />}
                <span>Deadline {formatDate(task.deadline)}</span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
      <Pagination
        basePath="/tasks"
        params={baseParams}
        page={safePage}
        totalPages={totalPages}
        total={tasks.length}
        label="task"
      />
    </>
  )
}
