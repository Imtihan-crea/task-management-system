import Link from 'next/link'
import { requireProfile } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { can } from '@/lib/auth/permissions'
import { AppShell } from '@/components/layout/AppShell'
import { PriorityBadge, TaskStatusBadge, OverdueBadge } from '@/components/ui/Badges'
import { formatDate, isOverdue, todayISO } from '@/lib/utils/dates'
import type { TaskPriority, TaskStatus } from '@/types/task'

type TaskRow = {
  id: string
  code: string
  title: string
  project_id: string
  workstream_id: string | null
  assignee_id: string
  priority: TaskPriority
  status: TaskStatus
  deadline: string
  created_at: string
  updated_at: string
}

function sanitize(value: string | undefined): string {
  return (value ?? '').replace(/[,()*%]/g, ' ').trim().slice(0, 60)
}

const PRIORITY_RANK: Record<TaskPriority, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 }

const SORT_OPTIONS = [
  { value: 'deadline.asc', label: 'Deadline (nearest, unfinished first)' },
  { value: 'deadline.desc', label: 'Deadline (farthest, unfinished first)' },
  { value: 'priority', label: 'Priority (High first)' },
  { value: 'created_at.desc', label: 'Created (newest)' },
  { value: 'updated_at.desc', label: 'Updated (newest)' },
]

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const profile = await requireProfile()
  const canCreate = can(profile.role, 'tasks.create')
  const isMember = profile.role === 'TEAM_MEMBER'

  const params = await searchParams
  const str = (v: string | string[] | undefined) => (typeof v === 'string' ? v : '')

  const q = sanitize(str(params.q)).toLowerCase()
  const view = str(params.view) // 'mine' untuk My Tasks
  const fProject = str(params.project)
  const fWorkstream = str(params.workstream)
  const fStatus = str(params.status)
  const fPriority = str(params.priority)
  const fDeadline = str(params.deadline) // '', 'overdue', 'week'
  const sort = str(params.sort) || 'deadline.asc'

  const admin = createAdminClient()

  // TEAM_MEMBER default hanya melihat task miliknya (§17, §43 matrix).
  const mineOnly = isMember || view === 'mine'

  let query = admin
    .from('tasks')
    .select('id, code, title, project_id, workstream_id, assignee_id, priority, status, deadline, created_at, updated_at')
    .eq('is_deleted', false)
    .order('deadline', { ascending: !sort.startsWith('deadline.desc') })
    .limit(500)

  if (mineOnly) query = query.eq('assignee_id', profile.id)
  if (fProject) query = query.eq('project_id', fProject)
  if (fWorkstream) query = query.eq('workstream_id', fWorkstream)
  if (fStatus) query = query.eq('status', fStatus)
  if (fPriority) query = query.eq('priority', fPriority)

  const { data, error } = await query
  let tasks = (data ?? []) as TaskRow[]

  // Lookup nama project / workstream / assignee
  const [projectsRes, workstreamsRes] = await Promise.all([
    admin.from('projects').select('id, code, name').limit(500),
    admin.from('workstreams').select('id, project_id, code, name').limit(1000),
  ])
  const projectList = (projectsRes.data ?? []) as { id: string; code: string; name: string }[]
  const workstreamList = (workstreamsRes.data ?? []) as { id: string; project_id: string; code: string; name: string }[]

  const projectNames = Object.fromEntries(projectList.map((p) => [p.id, `${p.code} · ${p.name}`]))
  const workstreamNames = Object.fromEntries(workstreamList.map((w) => [w.id, `${w.code} · ${w.name}`]))

  const assigneeIds = [...new Set(tasks.map((t) => t.assignee_id))]
  let assigneeNames: Record<string, string> = {}
  if (assigneeIds.length > 0) {
    const { data: users } = await admin
      .from('profiles')
      .select('id, full_name, email')
      .in('id', assigneeIds)
    assigneeNames = Object.fromEntries(
      ((users ?? []) as { id: string; full_name: string | null; email: string }[]).map((u) => [
        u.id,
        u.full_name || u.email,
      ])
    )
  }

  // Search: kode (prefix), nama, project, assignee
  if (q) {
    tasks = tasks.filter(
      (t) =>
        t.code.toLowerCase().startsWith(q) ||
        t.title.toLowerCase().includes(q) ||
        (projectNames[t.project_id] ?? '').toLowerCase().includes(q) ||
        (assigneeNames[t.assignee_id] ?? '').toLowerCase().includes(q)
    )
  }

  // Filter deadline
  if (fDeadline === 'overdue') {
    tasks = tasks.filter((t) => isOverdue(t.deadline, t.status))
  } else if (fDeadline === 'week') {
    const week = new Date()
    week.setDate(week.getDate() + 7)
    const weekISO = week.toISOString().slice(0, 10)
    tasks = tasks.filter((t) => t.deadline >= todayISO() && t.deadline <= weekISO && t.status !== 'DONE')
  }

  // Sort priority khusus
  if (sort === 'priority') {
    tasks = [...tasks].sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority])
  }

  // Default (deadline): unfinished dulu, DONE paling bawah.
  if (sort === 'deadline.asc' || sort === 'deadline.desc') {
    const desc = sort === 'deadline.desc'
    tasks = [...tasks].sort((a, b) => {
      const aDone = a.status === 'DONE' ? 1 : 0
      const bDone = b.status === 'DONE' ? 1 : 0
      if (aDone !== bDone) return aDone - bDone
      if (a.deadline === b.deadline) return 0
      return desc
        ? (a.deadline < b.deadline ? 1 : -1)
        : (a.deadline < b.deadline ? -1 : 1)
    })
  }

  const overdueCount = tasks.filter((t) => isOverdue(t.deadline, t.status)).length

  return (
    <AppShell>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{view === 'mine' ? 'My Tasks' : 'Tasks'}</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {tasks.length} task{tasks.length === 1 ? '' : 's'}
            {overdueCount > 0 && ` · ${overdueCount} overdue`}
          </p>
        </div>
        <div className="flex gap-2">
          {view === 'mine' ? (
            <Link
              href="/tasks"
              className="inline-flex min-h-[44px] items-center rounded-lg border px-4 py-2 text-sm font-semibold"
            >
              All Tasks
            </Link>
          ) : (
            <Link
              href="/tasks?view=mine"
              className="inline-flex min-h-[44px] items-center rounded-lg border px-4 py-2 text-sm font-semibold"
            >
              My Tasks
            </Link>
          )}
          {canCreate && (
            <Link
              href="/tasks/new"
              className="inline-flex min-h-[44px] items-center rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white dark:bg-white dark:text-black"
            >
              + Add Task
            </Link>
          )}
        </div>
      </div>

      <form
        method="get"
        className="mt-4 flex flex-col gap-3 rounded-2xl bg-white p-4 shadow dark:bg-zinc-900"
      >
        {view === 'mine' && <input type="hidden" name="view" value="mine" />}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="sm:col-span-2 lg:col-span-1">
            <label htmlFor="q" className="mb-1 block text-sm font-medium">
              Search
            </label>
            <input
              id="q"
              name="q"
              type="search"
              defaultValue={sanitize(str(params.q))}
              placeholder="Kode (T-01), nama, project, assignee"
              className="min-h-[44px] w-full rounded-lg border px-3 py-2 text-base dark:border-zinc-700 dark:bg-zinc-800"
            />
          </div>
          <div>
            <label htmlFor="project" className="mb-1 block text-sm font-medium">
              Project
            </label>
            <select
              id="project"
              name="project"
              defaultValue={fProject}
              className="min-h-[44px] w-full rounded-lg border px-3 py-2 text-base dark:border-zinc-700 dark:bg-zinc-800"
            >
              <option value="">All</option>
              {projectList.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} · {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="status" className="mb-1 block text-sm font-medium">
              Status
            </label>
            <select
              id="status"
              name="status"
              defaultValue={fStatus}
              className="min-h-[44px] w-full rounded-lg border px-3 py-2 text-base dark:border-zinc-700 dark:bg-zinc-800"
            >
              <option value="">All</option>
              {(['TODO', 'IN_PROGRESS', 'REVIEW', 'BLOCKED', 'DONE'] as const).map((s) => (
                <option key={s} value={s}>
                  {s.replace('_', ' ')}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="priority" className="mb-1 block text-sm font-medium">
              Priority
            </label>
            <select
              id="priority"
              name="priority"
              defaultValue={fPriority}
              className="min-h-[44px] w-full rounded-lg border px-3 py-2 text-base dark:border-zinc-700 dark:bg-zinc-800"
            >
              <option value="">All</option>
              {(['LOW', 'MEDIUM', 'HIGH'] as const).map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="deadline" className="mb-1 block text-sm font-medium">
              Deadline
            </label>
            <select
              id="deadline"
              name="deadline"
              defaultValue={fDeadline}
              className="min-h-[44px] w-full rounded-lg border px-3 py-2 text-base dark:border-zinc-700 dark:bg-zinc-800"
            >
              <option value="">All</option>
              <option value="overdue">Overdue</option>
              <option value="week">Due this week</option>
            </select>
          </div>
          <div>
            <label htmlFor="sort" className="mb-1 block text-sm font-medium">
              Sort
            </label>
            <select
              id="sort"
              name="sort"
              defaultValue={sort}
              className="min-h-[44px] w-full rounded-lg border px-3 py-2 text-base dark:border-zinc-700 dark:bg-zinc-800"
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <button
          type="submit"
          className="min-h-[44px] rounded-lg bg-black px-5 py-2 font-semibold text-white sm:w-auto dark:bg-white dark:text-black"
        >
          Apply
        </button>
      </form>

      {error ? (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm font-medium text-red-700 dark:bg-red-950 dark:text-red-300">
          Something went wrong. Please try again.
        </p>
      ) : tasks.length === 0 ? (
        <p className="mt-4 rounded-2xl bg-white p-8 text-center text-sm text-zinc-500 shadow dark:bg-zinc-900">
          No tasks found.
        </p>
      ) : (
        <>
          {/* Desktop table */}
          <div className="mt-4 hidden overflow-x-auto rounded-2xl bg-white shadow md:block dark:bg-zinc-900">
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
                {tasks.map((task) => (
                  <tr key={task.id} className="border-b last:border-0">
                    <td className="px-4 py-3 font-mono text-xs">{task.code}</td>
                    <td className="px-4 py-3">
                      <Link href={`/tasks/${task.id}`} className="font-medium hover:underline">
                        {task.title}
                      </Link>
                      {isOverdue(task.deadline, task.status) && (
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

          {/* Mobile cards */}
          <ul className="mt-4 flex flex-col gap-3 md:hidden">
            {tasks.map((task) => (
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
                    {isOverdue(task.deadline, task.status) && <OverdueBadge />}
                  </div>
                  <p className="mt-2 text-xs text-zinc-500">
                    Deadline {formatDate(task.deadline)}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </AppShell>
  )
}
