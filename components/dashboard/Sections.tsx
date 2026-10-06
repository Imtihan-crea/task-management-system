import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import { isOverdue, todayISO } from '@/lib/utils/dates'
import { PriorityBadge, TaskStatusBadge, OverdueBadge } from '@/components/ui/Badges'
import { KpiCard } from '@/components/ui/primitives'
import { PriorityBars, StatusDonut } from '@/components/dashboard/Charts'
import {
  getDashboardProjects,
  getDashboardScope,
  getDashboardTasks,
  type DashboardFilters,
} from '@/lib/data/dashboard'
import { assigneeName, fetchTaskLookups, type TaskAssignee } from '@/lib/data/task-list'
import type { TaskPriority, TaskStatus } from '@/types/task'

type Ctx = {
  userId: string
  role: string
  filters: DashboardFilters
}

function KpiLink({ label, value, href }: { label: string; value: number | string; href: string }) {
  return (
    <Link
      href={href}
      className="rounded-xl transition-transform hover:scale-[1.02] focus-visible:outline-2 focus-visible:outline-kasuat-gold"
    >
      <KpiCard label={label} value={value} />
    </Link>
  )
}

/**
 * Peta nama project + assignee untuk list mini.
 * Nama assignee diambil dari data yang SUDAH di-embed di query task,
 * jadi tidak ada query profiles tambahan di sini.
 */
async function namesFor(
  tasks: { project_id: string; assignee_id: string; assignee?: TaskAssignee | null }[]
): Promise<{ projectNames: Record<string, string>; assigneeNames: Record<string, string> }> {
  const lookups = await fetchTaskLookups()
  const projectNames = Object.fromEntries(
    lookups.projects.map((p) => [p.id, `${p.code} · ${p.name}`])
  )
  const assigneeNames: Record<string, string> = {}
  for (const t of tasks) {
    const name = assigneeName(t.assignee)
    if (name) assigneeNames[t.assignee_id] = name
  }
  return { projectNames, assigneeNames }
}

/** KPI utama + delta bulan lalu. */
export async function KpiSection({ userId, role, filters }: Ctx & { filters: DashboardFilters }) {
  const [projects, tasks]: [
    { id: string; code: string; name: string; status: string; created_at: string }[],
    import('@/lib/data/task-list').TaskRow[],
  ] = await Promise.all([
    getDashboardProjects(userId, role, filters.project),
    getDashboardTasks(userId, role, filters),
  ])

  const overdue = tasks.filter((t) => isOverdue(t.deadline, t.status))
  const ongoing = tasks.filter((t) => t.status === 'IN_PROGRESS')

  const now = new Date()
  const firstThisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  const newProjects = projects.filter((p) => p.created_at.slice(0, 10) >= firstThisMonth).length
  const newTasks = tasks.filter((t) => t.created_at.slice(0, 10) >= firstThisMonth).length

  return (
    <>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiLink label="Total Project" value={projects.length} href="/projects" />
        <KpiLink label="Total Task" value={tasks.length} href="/tasks" />
        <KpiLink label="Task On Going" value={ongoing.length} href="/tasks?view=ongoing" />
        <KpiLink label="Task Overdue" value={overdue.length} href="/tasks?view=overdue" />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 text-xs text-zinc-500 sm:grid-cols-4">
        <p>+{newProjects} dari bulan lalu</p>
        <p>+{newTasks} dari bulan lalu</p>
        <p>{tasks.length === 0 ? '0%' : Math.round((ongoing.length / tasks.length) * 100)}% dari total</p>
        <p>{tasks.length === 0 ? '0%' : Math.round((overdue.length / tasks.length) * 100)}% dari total</p>
      </div>
      {role === 'ADMIN' && <AdminUserKpis />}
    </>
  )
}

async function AdminUserKpis() {
  const admin = createAdminClient()
  const countBy = async (status: string) => {
    const { count } = await admin
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('status', status)
    return count ?? 0
  }
  const [invited, active, inactive] = await Promise.all([
    countBy('INVITED'),
    countBy('ACTIVE'),
    countBy('INACTIVE'),
  ])
  return (
    <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
      <KpiLink label="TOTAL USERS" value={invited + active + inactive} href="/users" />
      <KpiLink label="INVITED" value={invited} href="/users" />
      <KpiLink label="INACTIVE" value={inactive} href="/users" />
      <KpiLink label="PENDING SUGGESTIONS" value={0} href="/task-suggestions?status=PENDING" />
    </div>
  )
}

/** Donut status + bar priority. */
export async function ChartsSection({ userId, role, filters }: Ctx & { filters: DashboardFilters }) {
  const tasks = await getDashboardTasks(userId, role, filters)
  const open = tasks.filter((t) => t.status !== 'DONE' && t.status !== 'CANCELLED')

  const donutSegments = (
    [
      { status: 'IN_PROGRESS', label: 'On Going' },
      { status: 'DONE', label: 'Done' },
      { status: 'BLOCKED', label: 'Blocked' },
      { status: 'TODO', label: 'To Do' },
      { status: 'REVIEW', label: 'Review' },
      { status: 'CANCELLED', label: 'Cancelled' },
    ] as const
  ).map((s) => ({ ...s, value: tasks.filter((t) => t.status === s.status).length }))

  const prioritySummary = (['HIGH', 'MEDIUM', 'LOW'] as TaskPriority[]).map((p) => ({
    label: p,
    value: open.filter((t) => t.priority === p).length,
  }))

  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-2">
      <section className="rounded-2xl bg-white p-4 shadow dark:bg-zinc-900">
        <h2 className="mb-3 text-lg font-bold">Task per Status</h2>
        <StatusDonut segments={donutSegments} />
      </section>
      <section className="rounded-2xl bg-white p-4 shadow dark:bg-zinc-900">
        <h2 className="mb-3 text-lg font-bold">Task per Priority</h2>
        <PriorityBars items={prioritySummary} />
      </section>
    </div>
  )
}

function MiniList({
  items,
  empty,
  projectNames,
  assigneeNames,
}: {
  items: { id: string; code: string; title: string; project_id: string; assignee_id: string; priority: TaskPriority; status: TaskStatus; deadline: string }[]
  empty: string
  projectNames: Record<string, string>
  assigneeNames: Record<string, string>
}) {
  if (items.length === 0) {
    return <p className="text-sm text-zinc-500">{empty}</p>
  }
  return (
    <ul className="flex flex-col gap-2">
      {items.map((t) => (
        <li key={t.id}>
          <Link
            href={`/tasks/${t.id}`}
            className="flex items-center justify-between gap-2 rounded-xl border p-3 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">
                <span className="mr-2 rounded-md bg-zinc-100 px-1.5 py-0.5 font-mono text-xs dark:bg-zinc-800">
                  {t.code}
                </span>
                {t.title}
              </p>
              <p className="truncate text-xs text-zinc-500">
                {projectNames[t.project_id] ?? '-'} &middot; {assigneeNames[t.assignee_id] ?? '-'}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-1.5">
              <PriorityBadge priority={t.priority} />
              <TaskStatusBadge status={t.status} />
              {isOverdue(t.deadline, t.status) && <OverdueBadge />}
            </div>
          </Link>
        </li>
      ))}
    </ul>
  )
}

/** Task terdekat 7 hari + overdue + blocked. */
export async function UpcomingSection({ userId, role, filters }: Ctx & { filters: DashboardFilters }) {
  const tasks = await getDashboardTasks(userId, role, filters)
  const { projectNames, assigneeNames } = await namesFor(tasks)
  const today = todayISO()

  const weekEnd = new Date()
  weekEnd.setDate(weekEnd.getDate() + 7)
  const weekEndISO = weekEnd.toISOString().slice(0, 10)
  const upcoming = tasks
    .filter(
      (t) => t.status !== 'DONE' && t.status !== 'CANCELLED' && t.deadline >= today && t.deadline <= weekEndISO
    )
    .sort((a, b) => (a.deadline < b.deadline ? -1 : 1))
    .slice(0, 7)
  const overdue = tasks.filter((t) => isOverdue(t.deadline, t.status)).slice(0, 7)
  const blocked = tasks.filter((t) => t.status === 'BLOCKED').slice(0, 7)

  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-3">
      <section className="rounded-2xl bg-white p-4 shadow dark:bg-zinc-900">
        <h2 className="mb-3 text-lg font-bold">Task Terdekat (7 hari)</h2>
        <MiniList items={upcoming} empty="Tidak ada task dalam 7 hari ke depan." projectNames={projectNames} assigneeNames={assigneeNames} />
      </section>
      <section className="rounded-2xl bg-white p-4 shadow dark:bg-zinc-900">
        <h2 className="mb-3 text-lg font-bold">Overdue</h2>
        <MiniList items={overdue} empty="Tidak ada task overdue." projectNames={projectNames} assigneeNames={assigneeNames} />
      </section>
      <section className="rounded-2xl bg-white p-4 shadow dark:bg-zinc-900">
        <h2 className="mb-3 text-lg font-bold">Blocked</h2>
        <MiniList items={blocked} empty="Tidak ada task blocked." projectNames={projectNames} assigneeNames={assigneeNames} />
      </section>
    </div>
  )
}

/** Workload per assignee (admin + PM). */
export async function WorkloadSection({ userId, role, filters }: Ctx & { filters: DashboardFilters }) {
  if (role !== 'ADMIN' && role !== 'PROJECT_MANAGER') return null

  const tasks = await getDashboardTasks(userId, role, filters)
  const open = tasks.filter((t) => t.status !== 'DONE' && t.status !== 'CANCELLED')
  const { assigneeNames } = await namesFor(tasks)

  const workload = Object.entries(
    open.reduce<Record<string, number>>((acc, t) => {
      acc[t.assignee_id] = (acc[t.assignee_id] ?? 0) + 1
      return acc
    }, {})
  )
    .map(([id, count]) => ({ id, name: assigneeNames[id] ?? '-', count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)

  return (
    <section className="mt-6 rounded-2xl bg-white p-4 shadow dark:bg-zinc-900">
      <h2 className="mb-3 text-lg font-bold">Workload (open tasks per assignee)</h2>
      {workload.length === 0 ? (
        <p className="text-sm text-zinc-500">No open tasks.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {workload.map((w) => (
            <li key={w.id} className="flex items-center justify-between rounded-xl border px-4 py-2.5 dark:border-zinc-700">
              <span className="text-sm font-medium">{w.name}</span>
              <span className="text-lg font-bold">{w.count}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** Form filter manajemen (admin + PM). Pakai lookup bersama untuk project. */
export async function FilterSection({ filters }: { filters: DashboardFilters }) {
  const [lookups, usersRes] = await Promise.all([
    fetchTaskLookups(),
    createAdminClient()
      .from('profiles')
      .select('id, full_name, email')
      .eq('status', 'ACTIVE')
      .order('full_name')
      .limit(200),
  ])
  const projects = [...lookups.projects].sort((a, b) => a.name.localeCompare(b.name))
  const users = (usersRes.data ?? []) as { id: string; full_name: string | null; email: string }[]

  return (
    <form method="get" className="mt-4 flex flex-col gap-3 rounded-2xl bg-white p-4 shadow sm:flex-row sm:items-end sm:flex-wrap dark:bg-zinc-900">
      <div>
        <label htmlFor="f-project" className="mb-1 block text-sm font-medium">Project</label>
        <select id="f-project" name="project" defaultValue={filters.project} className="min-h-[44px] rounded-lg border px-3 py-2 text-base dark:border-zinc-700 dark:bg-zinc-800">
          <option value="">All</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.code} · {p.name}</option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="f-assignee" className="mb-1 block text-sm font-medium">Assignee</label>
        <select id="f-assignee" name="assignee" defaultValue={filters.assignee} className="min-h-[44px] rounded-lg border px-3 py-2 text-base dark:border-zinc-700 dark:bg-zinc-800">
          <option value="">All</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>{u.full_name || u.email}</option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="f-status" className="mb-1 block text-sm font-medium">Status</label>
        <select id="f-status" name="status" defaultValue={filters.status} className="min-h-[44px] rounded-lg border px-3 py-2 text-base dark:border-zinc-700 dark:bg-zinc-800">
          <option value="">All</option>
          {(['TODO', 'IN_PROGRESS', 'REVIEW', 'BLOCKED', 'DONE', 'CANCELLED'] as const).map((s) => (
            <option key={s} value={s}>{s.replace('_', ' ')}</option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="f-priority" className="mb-1 block text-sm font-medium">Priority</label>
        <select id="f-priority" name="priority" defaultValue={filters.priority} className="min-h-[44px] rounded-lg border px-3 py-2 text-base dark:border-zinc-700 dark:bg-zinc-800">
          <option value="">All</option>
          {(['HIGH', 'MEDIUM', 'LOW'] as const).map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
      </div>
      <button type="submit" className="min-h-[44px] rounded-lg bg-kasuat-gold px-5 py-2 font-semibold text-kasuat-black">
        Apply
      </button>
    </form>
  )
}

/** Pending suggestions dalam scope. */
export async function SuggestionsSection({
  userId,
  role,
}: {
  userId: string
  role: string
}) {
  if (role !== 'ADMIN' && role !== 'PROJECT_MANAGER' && role !== 'TEAM_MEMBER') return null

  const admin = createAdminClient()
  const scope = await getDashboardScope(userId, role)

  let q = admin
    .from('task_suggestions')
    .select('id, code, title, project_id, suggested_by, created_at')
    .eq('status', 'PENDING')
    .order('created_at', { ascending: false })
    .limit(10)
  if (scope.projectIds !== null) {
    q =
      scope.projectIds.length > 0
        ? q.in('project_id', scope.projectIds)
        : q.eq('project_id', '00000000-0000-0000-0000-000000000000')
  }
  if (role === 'TEAM_MEMBER') q = q.eq('suggested_by', userId)

  const { data } = await q
  const items = (data ?? []) as { id: string; code: string; title: string; project_id: string; created_at: string }[]
  const { projectNames } = await namesFor(
    items.map((s) => ({ project_id: s.project_id, assignee_id: '' }))
  )

  return (
    <section className="mt-6 rounded-2xl bg-white p-4 shadow dark:bg-zinc-900">
      <h2 className="mb-3 text-lg font-bold">Pending Suggestions ({items.length})</h2>
      {items.length === 0 ? (
        <p className="text-sm text-zinc-500">No pending suggestions.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((s) => (
            <li key={s.id}>
              <Link
                href={`/task-suggestions/${s.id}`}
                className="flex flex-col gap-1 rounded-xl border p-3 hover:bg-zinc-50 sm:flex-row sm:items-center sm:justify-between dark:border-zinc-700 dark:hover:bg-zinc-800"
              >
                <p className="truncate font-medium">
                  <span className="mr-2 rounded-md bg-zinc-100 px-1.5 py-0.5 font-mono text-xs dark:bg-zinc-800">
                    {s.code}
                  </span>
                  {s.title}
                </p>
                <p className="truncate text-xs text-zinc-500">{projectNames[s.project_id] ?? '-'}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
