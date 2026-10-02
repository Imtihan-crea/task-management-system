import Link from 'next/link'
import { requireProfile } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient as createUserClient } from '@/lib/supabase/server'
import { ROLE_LABELS, STATUS_LABELS } from '@/lib/auth/roles'
import { AppShell } from '@/components/layout/AppShell'
import { can } from '@/lib/auth/permissions'
import { formatDate, isOverdue, todayISO } from '@/lib/utils/dates'
import { PriorityBadge, TaskStatusBadge, OverdueBadge } from '@/components/ui/Badges'
import {
  ActivityTimeline,
  resolveActorNames,
  type ActivityEntry,
} from '@/components/activity/ActivityTimeline'
import type { UserStatus } from '@/types/profile'
import type { TaskPriority, TaskStatus } from '@/types/task'

/* ------------------------------------------------------------------ */
/* Types & helpers                                                     */
/* ------------------------------------------------------------------ */

type TaskRow = {
  id: string
  code: string
  title: string
  project_id: string
  assignee_id: string
  priority: TaskPriority
  status: TaskStatus
  deadline: string
  updated_at: string
}

type ProjectRow = {
  id: string
  code: string
  name: string
  status: string
}

function sanitize(value: string | undefined): string {
  return (value ?? '').replace(/[,()*%]/g, ' ').trim().slice(0, 60)
}

function Kpi({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border p-4">
      <p className="text-xs font-semibold tracking-wide text-zinc-500">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
    </div>
  )
}

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="mt-6 rounded-2xl bg-white p-5 shadow dark:bg-zinc-900">
      <h2 className="mb-3 text-lg font-bold">{title}</h2>
      {children}
    </section>
  )
}

async function RecentActivity() {
  const supabase = await createUserClient()

  const { data } = await supabase
    .from('activity_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(8)

  const entries = (data ?? []) as ActivityEntry[]
  const actorNames = await resolveActorNames(entries)

  return (
    <Section title="Recent Activity">
      <ActivityTimeline entries={entries} actorNames={actorNames} />
    </Section>
  )
}

function TaskMiniList({
  tasks,
  projectNames,
  assigneeNames,
  emptyText,
}: {
  tasks: TaskRow[]
  projectNames: Record<string, string>
  assigneeNames: Record<string, string>
  emptyText: string
}) {
  if (tasks.length === 0) {
    return <p className="text-sm text-zinc-500">{emptyText}</p>
  }
  return (
    <ul className="flex flex-col gap-2">
      {tasks.map((t) => (
        <li key={t.id}>
          <Link
            href={`/tasks/${t.id}`}
            className="flex flex-col gap-1 rounded-xl border p-3 hover:bg-zinc-50 sm:flex-row sm:items-center sm:justify-between dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            <div className="min-w-0">
              <p className="truncate font-medium">
                <span className="mr-2 rounded-md bg-zinc-100 px-1.5 py-0.5 font-mono text-xs dark:bg-zinc-800">
                  {t.code}
                </span>
                {t.title}
              </p>
              <p className="truncate text-xs text-zinc-500">
                {projectNames[t.project_id] ?? '-'} &middot; {assigneeNames[t.assignee_id] ?? '-'} &middot; DL {formatDate(t.deadline)}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
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

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const profile = await requireProfile()
  const params = await searchParams
  const str = (v: string | string[] | undefined) => (typeof v === 'string' ? v : '')

  const role = profile.role
  const isAdmin = role === 'ADMIN'
  const isPM = role === 'PROJECT_MANAGER'
  const isMember = role === 'TEAM_MEMBER'
  const showUserStats = can(role, 'users.view')

  // Filter manajemen (admin + PM). Member/viewer selalu scope miliknya.
  const fProject = (isAdmin || isPM) ? sanitize(str(params.project)) : ''
  const fAssignee = (isAdmin || isPM) ? sanitize(str(params.assignee)) : ''
  const fStatus = (isAdmin || isPM) ? str(params.status) : ''
  const fPriority = (isAdmin || isPM) ? str(params.priority) : ''

  const admin = createAdminClient()
  const today = todayISO()

  /* ---- Scope: project & task yang boleh dilihat role ini ---- */
  let projectIds: string[] | null = null // null = semua
  let taskAssignee: string | null = null // null = semua assignee

  if (isPM) {
    const { data: links } = await admin
      .from('project_managers')
      .select('project_id')
      .eq('user_id', profile.id)
    const myProjectIds = ((links ?? []) as { project_id: string }[]).map((l) => l.project_id)
    projectIds = myProjectIds
  } else if (isMember) {
    const { data: myTasks } = await admin
      .from('tasks')
      .select('project_id')
      .eq('assignee_id', profile.id)
      .eq('is_deleted', false)
      .limit(1000)
    projectIds = [
      ...new Set(((myTasks ?? []) as { project_id: string }[]).map((t) => t.project_id)),
    ]
    taskAssignee = profile.id
  }

  /* ---- Ambil data (bounded, server-side) ---- */
  let projectsQuery = admin
    .from('projects')
    .select('id, code, name, status')
    .order('created_at', { ascending: false })
    .limit(500)
  if (projectIds !== null) {
    projectsQuery =
      projectIds.length > 0
        ? projectsQuery.in('id', projectIds)
        : projectsQuery.eq('id', '00000000-0000-0000-0000-000000000000')
  }
  if (fProject) projectsQuery = projectsQuery.eq('id', fProject)

  let tasksQuery = admin
    .from('tasks')
    .select('id, code, title, project_id, assignee_id, priority, status, deadline, updated_at')
    .eq('is_deleted', false)
    .order('deadline', { ascending: true })
    .limit(2000)
  if (projectIds !== null) {
    tasksQuery =
      projectIds.length > 0
        ? tasksQuery.in('project_id', projectIds)
        : tasksQuery.eq('project_id', '00000000-0000-0000-0000-000000000000')
  }
  if (taskAssignee) tasksQuery = tasksQuery.eq('assignee_id', taskAssignee)
  if (fProject) tasksQuery = tasksQuery.eq('project_id', fProject)
  if (fAssignee && !taskAssignee) tasksQuery = tasksQuery.eq('assignee_id', fAssignee)
  if (fStatus) tasksQuery = tasksQuery.eq('status', fStatus)
  if (fPriority) tasksQuery = tasksQuery.eq('priority', fPriority)

  const [{ data: projectsData }, { data: tasksData }] = await Promise.all([
    projectsQuery,
    tasksQuery,
  ])

  const projects = (projectsData ?? []) as ProjectRow[]
  const tasks = (tasksData ?? []) as TaskRow[]

  const projectNames = Object.fromEntries(projects.map((p) => [p.id, `${p.code} · ${p.name}`]))
  // Project di luar scope list (mis. task beda scope) tetap perlu nama.
  const missingProjectIds = [...new Set(tasks.map((t) => t.project_id))].filter(
    (id) => !projectNames[id]
  )
  if (missingProjectIds.length > 0) {
    const { data: extra } = await admin
      .from('projects')
      .select('id, code, name')
      .in('id', missingProjectIds)
    for (const p of (extra ?? []) as { id: string; code: string; name: string }[]) {
      projectNames[p.id] = `${p.code} · ${p.name}`
    }
  }

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

  /* ---- KPI & monitoring (semua dari database) ---- */
  const open = tasks.filter((t) => t.status !== 'DONE')
  const overdue = tasks.filter((t) => isOverdue(t.deadline, t.status))
  const dueToday = tasks.filter((t) => t.deadline === today && t.status !== 'DONE')
  const blocked = tasks.filter((t) => t.status === 'BLOCKED')
  const doneCount = tasks.filter((t) => t.status === 'DONE').length
  const activeProjects = projects.filter((p) => p.status === 'ACTIVE').length

  const statusSummary = (['TODO', 'IN_PROGRESS', 'REVIEW', 'BLOCKED', 'DONE'] as TaskStatus[]).map(
    (s) => ({ label: s.replace('_', ' '), value: tasks.filter((t) => t.status === s).length })
  )
  const prioritySummary = (['HIGH', 'MEDIUM', 'LOW'] as TaskPriority[]).map((p) => ({
    label: p,
    value: open.filter((t) => t.priority === p).length,
  }))

  // Workload: active task count per assignee dalam scope.
  const workload = Object.entries(
    open.reduce<Record<string, number>>((acc, t) => {
      acc[t.assignee_id] = (acc[t.assignee_id] ?? 0) + 1
      return acc
    }, {})
  )
    .map(([id, count]) => ({ id, name: assigneeNames[id] ?? '-', count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)

  // Pending suggestions dalam scope.
  let pendingSuggestions: { id: string; code: string; title: string; project_id: string; suggested_by: string; created_at: string }[] = []
  if (isAdmin || isPM || isMember) {
    let sugQuery = admin
      .from('task_suggestions')
      .select('id, code, title, project_id, suggested_by, created_at')
      .eq('status', 'PENDING')
      .order('created_at', { ascending: false })
      .limit(50)
    if (projectIds !== null) {
      sugQuery =
        projectIds.length > 0
          ? sugQuery.in('project_id', projectIds)
          : sugQuery.eq('project_id', '00000000-0000-0000-0000-000000000000')
    }
    if (isMember) sugQuery = sugQuery.eq('suggested_by', profile.id)
    const { data: sug } = await sugQuery
    pendingSuggestions = (sug ?? []) as typeof pendingSuggestions
  }

  // User stats (admin saja, seperti sebelumnya).
  let userStats: Record<UserStatus, number> | null = null
  if (showUserStats) {
    const countBy = async (status: UserStatus) => {
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
    userStats = { INVITED: invited, ACTIVE: active, INACTIVE: inactive }
  }

  // Jumlah open task milik sendiri (untuk link My Tasks).
  const { count: myOpenCount } = await admin
    .from('tasks')
    .select('id', { count: 'exact', head: true })
    .eq('assignee_id', profile.id)
    .eq('is_deleted', false)
    .neq('status', 'DONE')

  // Opsi filter (admin/PM).
  const [filterProjects, filterUsers] =
    isAdmin || isPM
      ? await Promise.all([
          admin.from('projects').select('id, code, name').order('name').limit(200),
          admin
            .from('profiles')
            .select('id, full_name, email')
            .eq('status', 'ACTIVE')
            .order('full_name')
            .limit(200),
        ]).then(([p, u]) => [p.data ?? [], u.data ?? []] as const)
      : [[], []]

  const denied = params.denied === '1'

  return (
    <AppShell>
      {denied && (
        <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm font-medium text-red-700 dark:bg-red-950 dark:text-red-300">
          You do not have permission to perform this action.
        </p>
      )}

      <h1 className="text-2xl font-bold">Dashboard</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Welcome, {profile.full_name || profile.email} &middot; {ROLE_LABELS[profile.role]} &middot; {STATUS_LABELS[profile.status]}
      </p>

      {/* KPI */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="TOTAL PROJECTS" value={projects.length} />
        <Kpi label="ACTIVE PROJECTS" value={activeProjects} />
        <Kpi label="OPEN TASKS" value={open.length} />
        <Kpi label="OVERDUE" value={overdue.length} />
        <Kpi label="BLOCKED" value={blocked.length} />
        <Kpi label="COMPLETED" value={doneCount} />
        <Kpi label="DUE TODAY" value={dueToday.length} />
        {userStats ? (
          <Kpi label="ACTIVE MEMBERS" value={userStats.ACTIVE} />
        ) : (
          <Kpi label="PENDING SUGGESTIONS" value={pendingSuggestions.length} />
        )}
      </div>
      {isAdmin && (
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Kpi label="TOTAL USERS" value={userStats!.INVITED + userStats!.ACTIVE + userStats!.INACTIVE} />
          <Kpi label="INVITED" value={userStats!.INVITED} />
          <Kpi label="INACTIVE" value={userStats!.INACTIVE} />
          <Kpi label="PENDING SUGGESTIONS" value={pendingSuggestions.length} />
        </div>
      )}

      {/* Filter manajemen */}
      {(isAdmin || isPM) && (
        <form method="get" className="mt-4 flex flex-col gap-3 rounded-2xl bg-white p-4 shadow sm:flex-row sm:items-end sm:flex-wrap dark:bg-zinc-900">
          <div>
            <label htmlFor="f-project" className="mb-1 block text-sm font-medium">Project</label>
            <select id="f-project" name="project" defaultValue={fProject} className="min-h-[44px] rounded-lg border px-3 py-2 text-base dark:border-zinc-700 dark:bg-zinc-800">
              <option value="">All</option>
              {(filterProjects as { id: string; code: string; name: string }[]).map((p) => (
                <option key={p.id} value={p.id}>{p.code} · {p.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="f-assignee" className="mb-1 block text-sm font-medium">Assignee</label>
            <select id="f-assignee" name="assignee" defaultValue={fAssignee} className="min-h-[44px] rounded-lg border px-3 py-2 text-base dark:border-zinc-700 dark:bg-zinc-800">
              <option value="">All</option>
              {(filterUsers as { id: string; full_name: string | null; email: string }[]).map((u) => (
                <option key={u.id} value={u.id}>{u.full_name || u.email}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="f-status" className="mb-1 block text-sm font-medium">Status</label>
            <select id="f-status" name="status" defaultValue={fStatus} className="min-h-[44px] rounded-lg border px-3 py-2 text-base dark:border-zinc-700 dark:bg-zinc-800">
              <option value="">All</option>
              {(['TODO', 'IN_PROGRESS', 'REVIEW', 'BLOCKED', 'DONE'] as const).map((s) => (
                <option key={s} value={s}>{s.replace('_', ' ')}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="f-priority" className="mb-1 block text-sm font-medium">Priority</label>
            <select id="f-priority" name="priority" defaultValue={fPriority} className="min-h-[44px] rounded-lg border px-3 py-2 text-base dark:border-zinc-700 dark:bg-zinc-800">
              <option value="">All</option>
              {(['HIGH', 'MEDIUM', 'LOW'] as const).map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
          <button type="submit" className="min-h-[44px] rounded-lg bg-black px-5 py-2 font-semibold text-white dark:bg-white dark:text-black">
            Apply
          </button>
        </form>
      )}

      {/* Status & priority summary */}
      <Section title="Task Summary">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {statusSummary.map((s) => (
            <Kpi key={s.label} label={s.label} value={s.value} />
          ))}
        </div>
        <div className="mt-3 grid grid-cols-3 gap-3">
          {prioritySummary.map((p) => (
            <Kpi key={p.label} label={`${p.label} (OPEN)`} value={p.value} />
          ))}
        </div>
      </Section>

      {/* Deadline monitoring */}
      <Section title="Deadline Monitoring">
        <h3 className="mb-2 text-sm font-semibold">Due Today ({dueToday.length})</h3>
        <TaskMiniList tasks={dueToday.slice(0, 10)} projectNames={projectNames} assigneeNames={assigneeNames} emptyText="Nothing due today." />
        <h3 className="mb-2 mt-5 text-sm font-semibold">Overdue ({overdue.length})</h3>
        <TaskMiniList tasks={overdue.slice(0, 10)} projectNames={projectNames} assigneeNames={assigneeNames} emptyText="No overdue tasks." />
      </Section>

      {/* Blocked */}
      <Section title={`Blocked Tasks (${blocked.length})`}>
        <TaskMiniList tasks={blocked.slice(0, 10)} projectNames={projectNames} assigneeNames={assigneeNames} emptyText="No blocked tasks." />
      </Section>

      {/* Workload (admin + PM) */}
      {(isAdmin || isPM) && (
        <Section title="Workload (open tasks per assignee)">
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
        </Section>
      )}

      {/* Pending suggestions */}
      {(isAdmin || isPM || isMember) && (
        <Section title={`Pending Suggestions (${pendingSuggestions.length})`}>
          {pendingSuggestions.length === 0 ? (
            <p className="text-sm text-zinc-500">No pending suggestions.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {pendingSuggestions.slice(0, 10).map((s) => (
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
                    <p className="truncate text-xs text-zinc-500">
                      {projectNames[s.project_id] ?? '-'} &middot; {formatDate(s.created_at)}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}

      {/* Recent Activity (scope mengikuti RLS user) */}
      <RecentActivity />

      {/* Quick links */}
      <div className="mt-6 flex flex-wrap gap-2">
        <Link href="/projects" className="inline-flex min-h-[44px] items-center rounded-lg border px-4 py-2 text-sm font-semibold">Projects</Link>
        <Link href="/tasks" className="inline-flex min-h-[44px] items-center rounded-lg border px-4 py-2 text-sm font-semibold">Tasks</Link>
        <Link href="/tasks?view=mine" className="inline-flex min-h-[44px] items-center rounded-lg border px-4 py-2 text-sm font-semibold">
          My Tasks ({myOpenCount ?? 0} open)
        </Link>
      </div>
    </AppShell>
  )
}
