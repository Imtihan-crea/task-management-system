import Link from 'next/link'
import { formatDate, isOverdue, showsOverdueBadge, todayISO } from '@/lib/utils/dates'
import { PriorityBadge, TaskStatusBadge, OverdueBadge } from '@/components/ui/Badges'
import { Pagination, paginate } from '@/components/ui/Pagination'
import { applyTaskTab, type TaskTabKey } from '@/components/tasks/TaskTabs'
import { assigneeName, fetchTaskLookups, fetchTaskRows } from '@/lib/data/task-list'
import { EmptyState } from '@/components/ui/primitives'
import type { TaskPriority } from '@/types/task'

const PRIORITY_RANK: Record<TaskPriority, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 }

export type TaskFilters = {
  q: string
  tab: TaskTabKey
  userId: string
  role: string
  project: string
  workstream: string
  status: string
  priority: string
  deadline: string
  sort: string
  page: number
}

/**
 * Hasil task: fetch + filter + sort + paginate.
 * Dijalankan dalam Suspense boundary — hanya area ini yang loading (§12).
 */
export async function TaskResults({ filters }: { filters: TaskFilters }) {
  const { q, tab, userId, role, sort, page } = filters

  // Fetch bersama TaskTabs via cache() — 1x query per request.
  const [allTasks, lookups] = await Promise.all([
    fetchTaskRows({
      userId,
      role,
      project: filters.project,
      workstream: filters.workstream,
      priority: filters.priority,
      deadline: filters.deadline,
    }),
    fetchTaskLookups(),
  ])
  let tasks = allTasks

  const projectNames = Object.fromEntries(
    lookups.projects.map((p) => [p.id, `${p.code} · ${p.name}`])
  )
  const workstreamNames = Object.fromEntries(
    lookups.workstreams.map((w) => [w.id, `${w.code} · ${w.name}`])
  )

  // Nama assignee sudah ikut embed di fetchTaskRows -> 0 query tambahan.
  const assigneeNames: Record<string, string> = Object.fromEntries(
    tasks
      .filter((t) => assigneeName(t.assignee))
      .map((t) => [t.assignee_id, assigneeName(t.assignee)])
  )

  const needle = q.toLowerCase()
  if (needle) {
    tasks = tasks.filter(
      (t) =>
        t.code.toLowerCase().startsWith(needle) ||
        t.title.toLowerCase().includes(needle) ||
        (projectNames[t.project_id] ?? '').toLowerCase().includes(needle) ||
        (assigneeNames[t.assignee_id] ?? '').toLowerCase().includes(needle)
    )
  }

  // Tab + dropdown status digabung (AND).
  tasks = applyTaskTab(tasks, tab, userId)
  if (filters.status) tasks = tasks.filter((t) => t.status === filters.status)

  if (filters.deadline === 'overdue') {
    tasks = tasks.filter((t) => isOverdue(t.deadline, t.status))
  } else if (filters.deadline === 'week') {
    const week = new Date()
    week.setDate(week.getDate() + 7)
    const weekISO = week.toISOString().slice(0, 10)
    tasks = tasks.filter(
      (t) =>
        t.deadline >= todayISO() &&
        t.deadline <= weekISO &&
        t.status !== 'DONE' &&
        t.status !== 'CANCELLED'
    )
  }

  if (sort === 'priority') {
    tasks = [...tasks].sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority])
  }
  if (sort === 'deadline.asc' || sort === 'deadline.desc') {
    const desc = sort === 'deadline.desc'
    tasks = [...tasks].sort((a, b) => {
      // Terminal (DONE/CANCELLED) selalu di bawah, seperti sebelumnya.
      const aClosed = a.status === 'DONE' || a.status === 'CANCELLED' ? 1 : 0
      const bClosed = b.status === 'DONE' || b.status === 'CANCELLED' ? 1 : 0
      if (aClosed !== bClosed) return aClosed - bClosed
      if (a.deadline === b.deadline) return 0
      return desc ? (a.deadline < b.deadline ? 1 : -1) : a.deadline < b.deadline ? -1 : 1
    })
  }

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
        <EmptyState title="No tasks found." message="Try a different search, tab, or filter." />
      </div>
    )
  }

  return (
    <>
      <p className="mt-3 text-sm text-zinc-500" role="status">
        {tasks.length} task{tasks.length === 1 ? '' : 's'}
        {overdueCount > 0 ? ` · ${overdueCount} overdue` : ''}
      </p>
      <div className="mt-3 hidden overflow-x-auto rounded-2xl bg-white shadow md:block dark:bg-zinc-900">
        <table className="w-full text-left text-sm">
          <thead className="border-b text-xs uppercase text-zinc-500">
            <tr>
              <th scope="col" className="px-4 py-3">ID</th>
              <th scope="col" className="px-4 py-3">Task</th>
              <th scope="col" className="px-4 py-3">Project</th>
              <th scope="col" className="px-4 py-3">Workstream</th>
              <th scope="col" className="px-4 py-3">Assignee</th>
              <th scope="col" className="px-4 py-3">Priority</th>
              <th scope="col" className="px-4 py-3">Status</th>
              <th scope="col" className="px-4 py-3">Deadline</th>
            </tr>
          </thead>
          <tbody>
            {pageItems.map((task) => (
              <tr key={task.id} className="relative border-b last:border-0">
                <td className="px-4 py-3 font-mono text-xs">{task.code}</td>
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
                <td className="px-4 py-3">{formatDate(task.deadline)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="mt-4 flex flex-col gap-3 md:hidden">
        {pageItems.map((task) => (
          <li key={task.id}>
            <Link
              href={`/tasks/${task.id}`}
              className="block rounded-2xl bg-white p-4 shadow dark:bg-zinc-900"
            >
              <p className="font-semibold">
                <span className="mr-2 rounded-md bg-zinc-100 px-1.5 py-0.5 font-mono text-xs dark:bg-zinc-800">
                  {task.code}
                </span>
                {task.title}
              </p>
              <p className="mt-0.5 truncate text-sm text-zinc-500">
                {projectNames[task.project_id] ?? '-'} &middot;{' '}
                {task.workstream_id ? (workstreamNames[task.workstream_id] ?? '-') : 'No workstream'} &middot;{' '}
                {assigneeNames[task.assignee_id] ?? '-'}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <PriorityBadge priority={task.priority} />
                <TaskStatusBadge status={task.status} />
                {showsOverdueBadge(task.deadline, task.status, task.completed_at, task.cancelled_at) && <OverdueBadge />}
              </div>
              <p className="mt-2 text-xs text-zinc-500">
                Deadline {formatDate(task.deadline)}
              </p>
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
        label="tasks"
      />
    </>
  )
}
