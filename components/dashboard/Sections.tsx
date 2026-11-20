import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import { appDateOf, daysFromTodayISO, isOverdue, todayISO } from '@/lib/utils/dates'
import { PriorityBadge, TaskStatusBadge, OverdueBadge } from '@/components/ui/Badges'
import { FIELD, FIELD_LABEL, FILTER_GRID, FilterPanel, KpiCard, SUBMIT } from '@/components/ui/primitives'
import { PriorityBars, StatusDonut } from '@/components/dashboard/Charts'
import {
  getDashboardProjects,
  getDashboardScope,
  getDashboardTasks,
  type DashboardFilters,
} from '@/lib/data/dashboard'
import { assigneeName, fetchTaskLookups, type TaskAssignee } from '@/lib/data/task-list'
import type { TaskPriority, TaskStatus } from '@/types/task'
import { taskStatusLabel } from '@/lib/auth/roles'

type Ctx = {
  userId: string
  role: string
  filters: DashboardFilters
}

function KpiLink({ label, value, href, hint }: { label: string; value: number | string; href: string; hint?: string }) {
  return (
    <Link href={href} className="block rounded-xl transition-shadow hover:shadow-md">
      <KpiCard label={label} value={value} hint={hint} />
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

  const firstThisMonth = `${todayISO().slice(0, 7)}-01`
  const newProjects = projects.filter((p) => appDateOf(p.created_at) >= firstThisMonth).length
  const newTasks = tasks.filter((t) => appDateOf(t.created_at) >= firstThisMonth).length
  const pct = (n: number) => `${tasks.length === 0 ? 0 : Math.round((n / tasks.length) * 100)}%`

  return (
    <>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiLink label="Total Project" value={projects.length} href="/projects" hint={`+${newProjects} bulan ini`} />
        <KpiLink label="Total Task" value={tasks.length} href="/tasks" hint={`+${newTasks} bulan ini`} />
        <KpiLink label="Task Berjalan" value={ongoing.length} href="/tasks?view=ongoing" hint={`${pct(ongoing.length)} dari total`} />
        <KpiLink label="Task Overdue" value={overdue.length} href="/tasks?view=overdue" hint={`${pct(overdue.length)} dari total`} />
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
  const [invited, active, inactive, { count: pendingSuggestions }] = await Promise.all([
    countBy('INVITED'),
    countBy('ACTIVE'),
    countBy('INACTIVE'),
    // Sebelumnya hardcode 0 (audit C6). Kartu ini hanya untuk ADMIN.
    admin
      .from('task_suggestions')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'PENDING'),
  ])
  return (
    <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
      <KpiLink label="Total User" value={invited + active + inactive} href="/users" />
      <KpiLink label="User Diundang" value={invited} href="/users" />
      <KpiLink label="User Nonaktif" value={inactive} href="/users" />
      <KpiLink label="Suggestion Pending" value={pendingSuggestions ?? 0} href="/task-suggestions?status=PENDING" />
    </div>
  )
}

/** Donut status + bar priority. */
export async function ChartsSection({ userId, role, filters }: Ctx & { filters: DashboardFilters }) {
  const tasks = await getDashboardTasks(userId, role, filters)
  const open = tasks.filter((t) => t.status !== 'DONE' && t.status !== 'CANCELLED')

  const donutSegments = (
    [
      { status: 'IN_PROGRESS', label: 'Berjalan' },
      { status: 'DONE', label: 'Done' },
      { status: 'BLOCKED', label: 'Blocked' },
      { status: 'TODO', label: 'To Do' },
      { status: 'REVIEW', label: 'Menunggu Review PM' },
      { status: 'CANCELLED', label: 'Cancelled' },
    ] as const
  ).map((s) => ({ ...s, value: tasks.filter((t) => t.status === s.status).length }))

  const prioritySummary = (['HIGH', 'MEDIUM', 'LOW'] as TaskPriority[]).map((p) => ({
    label: p,
    value: open.filter((t) => t.priority === p).length,
  }))

  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-2">
      <section className="rounded-2xl bg-white p-4 shadow-sm dark:bg-zinc-900">
        <h2 className="mb-2 text-base font-bold">Task per Status</h2>
        <StatusDonut segments={donutSegments} />
      </section>
      <section className="rounded-2xl bg-white p-4 shadow-sm dark:bg-zinc-900">
        <h2 className="mb-2 text-base font-bold">Task per Prioritas</h2>
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
  hideOverdue = false,
}: {
  hideOverdue?: boolean
  items: { id: string; code: string; title: string; project_id: string; assignee_id: string; priority: TaskPriority; status: TaskStatus; deadline: string }[]
  empty: string
  projectNames: Record<string, string>
  assigneeNames: Record<string, string>
}) {
  if (items.length === 0) {
    return <p className="text-sm text-zinc-600 dark:text-zinc-400">{empty}</p>
  }
  return (
    <ul className="-mx-2 divide-y divide-zinc-100 dark:divide-zinc-800">
      {items.map((t) => (
        <li key={t.id}>
          <Link
            href={`/tasks/${t.id}`}
            className="flex min-h-[44px] items-start justify-between gap-3 rounded-lg px-2 py-2.5 hover:bg-zinc-50 dark:hover:bg-zinc-800"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">
                <span className="mr-1.5 font-mono text-xs text-zinc-600 dark:text-zinc-400">{t.code}</span>
                {t.title}
              </p>
              <p className="truncate text-xs text-zinc-600 dark:text-zinc-400">
                {projectNames[t.project_id] ?? '-'} &middot; {assigneeNames[t.assignee_id] ?? '-'}
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <TaskStatusBadge status={t.status} />
              {t.priority === 'HIGH' && <PriorityBadge priority={t.priority} />}
              {!hideOverdue && isOverdue(t.deadline, t.status) && <OverdueBadge />}
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

  const weekEndISO = daysFromTodayISO(7)
  const upcoming = tasks
    .filter(
      (t) => t.status !== 'DONE' && t.status !== 'CANCELLED' && t.deadline >= today && t.deadline <= weekEndISO
    )
    .sort((a, b) => (a.deadline < b.deadline ? -1 : 1))
    .slice(0, 7)
  const overdue = tasks.filter((t) => isOverdue(t.deadline, t.status)).slice(0, 7)
  const blocked = tasks.filter((t) => t.status === 'BLOCKED').slice(0, 7)

  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-3 [&>*]:min-w-0">
      <section className="rounded-2xl bg-white p-4 shadow-sm dark:bg-zinc-900">
        <h2 className="mb-2 text-base font-bold">Task Terdekat (7 hari)</h2>
        <MiniList items={upcoming} empty="Tidak ada task dalam 7 hari ke depan." projectNames={projectNames} assigneeNames={assigneeNames} />
      </section>
      <section className="rounded-2xl bg-white p-4 shadow-sm dark:bg-zinc-900">
        <h2 className="mb-2 text-base font-bold">Overdue</h2>
        <MiniList hideOverdue items={overdue} empty="Tidak ada task overdue." projectNames={projectNames} assigneeNames={assigneeNames} />
      </section>
      <section className="rounded-2xl bg-white p-4 shadow-sm dark:bg-zinc-900">
        <h2 className="mb-2 text-base font-bold">Blocked</h2>
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
  const max = workload[0]?.count ?? 1

  return (
    <section className="mt-6 rounded-2xl bg-white p-4 shadow-sm dark:bg-zinc-900">
      <h2 className="mb-2 text-base font-bold">Workload <span className="text-sm font-normal text-zinc-600 dark:text-zinc-400">(task terbuka per assignee)</span></h2>
      {workload.length === 0 ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">Tidak ada task terbuka.</p>
      ) : (
        <ul className="grid gap-x-8 gap-y-2.5 md:grid-cols-2">
          {workload.map((w) => (
            <li key={w.id} className="grid grid-cols-[minmax(0,9rem)_1fr_2rem] items-center gap-3 text-sm">
              <span className="truncate font-medium">{w.name}</span>
              <span aria-hidden="true" className="h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                <span className="block h-full rounded-full bg-kasuat-gold" style={{ width: `${(w.count / max) * 100}%` }} />
              </span>
              <span className="text-right font-semibold tabular-nums">{w.count}</span>
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
    <FilterPanel active={[filters.project, filters.assignee, filters.status, filters.priority].filter(Boolean).length}>
    <form method="get" className={FILTER_GRID}>
      <div>
        <label htmlFor="f-project" className={FIELD_LABEL}>Project</label>
        <select id="f-project" name="project" defaultValue={filters.project} className={FIELD}>
          <option value="">Semua</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.code} · {p.name}</option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="f-assignee" className={FIELD_LABEL}>Assignee</label>
        <select id="f-assignee" name="assignee" defaultValue={filters.assignee} className={FIELD}>
          <option value="">Semua</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>{u.full_name || u.email}</option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="f-status" className={FIELD_LABEL}>Status</label>
        <select id="f-status" name="status" defaultValue={filters.status} className={FIELD}>
          <option value="">Semua</option>
          {(['TODO', 'IN_PROGRESS', 'REVIEW', 'BLOCKED', 'DONE', 'CANCELLED'] as const).map((s) => (
            <option key={s} value={s}>{taskStatusLabel(s)}</option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="f-priority" className={FIELD_LABEL}>Prioritas</label>
        <select id="f-priority" name="priority" defaultValue={filters.priority} className={FIELD}>
          <option value="">Semua</option>
          {(['HIGH', 'MEDIUM', 'LOW'] as const).map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
      </div>
      <button type="submit" className={SUBMIT}>
        Terapkan
      </button>
    </form>
    </FilterPanel>
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
    <section className="mt-6 rounded-2xl bg-white p-4 shadow-sm dark:bg-zinc-900">
      <h2 className="mb-2 text-base font-bold">Pending Suggestions ({items.length})</h2>
      {items.length === 0 ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">Tidak ada Suggestion PENDING.</p>
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
                <p className="truncate text-xs text-zinc-600 dark:text-zinc-400">{projectNames[s.project_id] ?? '-'}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
