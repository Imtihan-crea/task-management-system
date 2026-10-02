import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireProfile } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { can } from '@/lib/auth/permissions'
import { AppShell } from '@/components/layout/AppShell'
import { ProjectStatusBadge, TaskStatusBadge, PriorityBadge, OverdueBadge } from '@/components/ui/Badges'
import { formatDate, isOverdue } from '@/lib/utils/dates'
import { ProjectForm } from '@/components/projects/ProjectForm'
import {
  CreateWorkstreamForm,
  DeleteWorkstreamForm,
  EditWorkstreamForm,
} from '@/components/projects/WorkstreamForms'
import { getActiveUsers } from '@/lib/data/users'
import { isProjectManager } from '@/lib/data/projects'
import type { Project, ProjectProgress } from '@/types/project'
import type { WorkstreamListItem } from '@/types/workstream'
import type { TaskStatus } from '@/types/task'

type TaskRow = {
  id: string
  title: string
  workstream_id: string | null
  assignee_id: string
  priority: 'LOW' | 'MEDIUM' | 'HIGH'
  status: TaskStatus
  deadline: string
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 border-b py-2.5 last:border-0 sm:flex-row sm:justify-between sm:gap-4">
      <dt className="text-sm text-zinc-500">{label}</dt>
      <dd className="text-sm font-medium break-all">{value}</dd>
    </div>
  )
}

export default async function ProjectDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const profile = await requireProfile()
  const { id } = await params

  const canEditProject = can(profile.role, 'projects.edit')
  const canManageWorkstream = can(profile.role, 'workstreams.create')

  const admin = createAdminClient()
  const { data: project } = await admin
    .from('projects')
    .select('*')
    .eq('id', id)
    .single<Project>()

  if (!project) notFound()

  // PM boleh lihat semua project, tapi hanya kelola miliknya (salah satunya).
  const isOwner =
    profile.role === 'ADMIN' ||
    (profile.role === 'PROJECT_MANAGER' && (await isProjectManager(id, profile.id)))
  const canEditThis = profile.role === 'ADMIN' || isOwner

  // MEMBER hanya boleh buka project yang dia terlibat (punya task aktif).
  if (profile.role === 'TEAM_MEMBER') {
    const { count: involved } = await admin
      .from('tasks')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', id)
      .eq('assignee_id', profile.id)
      .eq('is_deleted', false)

    if ((involved ?? 0) === 0) {
      notFound()
    }
  }

  const [{ data: workstreams }, { data: tasks }, { data: pmLinks }] = await Promise.all([
    admin
      .from('workstreams')
      .select('id, project_id, name, description, created_at')
      .eq('project_id', id)
      .order('created_at', { ascending: true }),
    admin
      .from('tasks')
      .select('id, title, workstream_id, assignee_id, priority, status, deadline')
      .eq('project_id', id)
      .eq('is_deleted', false)
      .order('deadline', { ascending: true })
      .limit(500),
    admin.from('project_managers').select('user_id').eq('project_id', id),
  ])
  const pmIds = ((pmLinks ?? []) as { user_id: string }[]).map((l) => l.user_id)

  let pmDisplay = '-'
  if (pmIds.length > 0) {
    const { data: pmProfiles } = await admin
      .from('profiles')
      .select('full_name, email')
      .in('id', pmIds)

    pmDisplay =
      ((pmProfiles ?? []) as { full_name: string | null; email: string }[])
        .map((u) => u.full_name || u.email)
        .join(', ') || '-'
  }

  const wsList = (workstreams ?? []) as WorkstreamListItem[]
  const taskList = (tasks ?? []) as TaskRow[]

  // Nama assignee
  const assigneeIds = [...new Set(taskList.map((t) => t.assignee_id))]
  let assigneeNames: Record<string, string> = {}
  if (assigneeIds.length > 0) {
    const { data: users } = await admin
      .from('profiles')
      .select('id, full_name, email')
      .in('id', assigneeIds)
    assigneeNames = Object.fromEntries(
      ((users ?? []) as { id: string; full_name: string | null; email: string }[]).map(
        (u) => [u.id, u.full_name || u.email]
      )
    )
  }

  const wsNames = Object.fromEntries(wsList.map((w) => [w.id, w.name]))

  // Progress (task-count based, exclude deleted — query sudah filter)
  const progress: ProjectProgress = {
    total: taskList.length,
    completed: taskList.filter((t) => t.status === 'DONE').length,
    inProgress: taskList.filter((t) => t.status === 'IN_PROGRESS').length,
    blocked: taskList.filter((t) => t.status === 'BLOCKED').length,
    todo: taskList.filter((t) => t.status === 'TODO' || t.status === 'REVIEW').length,
    percent: 0,
  }
  progress.percent =
    progress.total === 0 ? 0 : Math.round((progress.completed / progress.total) * 100)

  // Filter task di project detail
  const query = await searchParams
  const str = (v: string | string[] | undefined) => (typeof v === 'string' ? v : '')
  const fWs = str(query.ws)
  const fStatus = str(query.status)
  const fPriority = str(query.priority)

  const visibleTasks = taskList
    .filter(
      (t) =>
        (!fWs || t.workstream_id === fWs) &&
        (!fStatus || t.status === fStatus) &&
        (!fPriority || t.priority === fPriority)
    )
    // Unfinished dulu, lalu deadline terdekat; DONE paling bawah.
    .sort((a, b) => {
      const aDone = a.status === 'DONE' ? 1 : 0
      const bDone = b.status === 'DONE' ? 1 : 0
      if (aDone !== bDone) return aDone - bDone
      return a.deadline < b.deadline ? -1 : a.deadline > b.deadline ? 1 : 0
    })

  const managers = canEditThis ? await getActiveUsers(['ADMIN', 'PROJECT_MANAGER']) : []

  return (
    <AppShell>
      <Link href="/projects" className="text-sm font-medium text-zinc-500 hover:underline">
        &larr; Back to Projects
      </Link>

      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">{project.name}</h1>
        <ProjectStatusBadge status={project.status} />
      </div>
      <p className="mt-1 text-sm text-zinc-500">
        {project.client || 'No client'} &middot; PM: {pmDisplay}
      </p>

      <div className="mt-4 grid gap-6 lg:grid-cols-2 lg:items-start">
        <section className="rounded-2xl bg-white p-5 shadow dark:bg-zinc-900">
          <h2 className="mb-2 text-lg font-bold">Project Detail</h2>
          <dl>
            <Row label="Client" value={project.client || '-'} />
            <Row label="Description" value={project.description || '-'} />
            <Row label="Start Date" value={formatDate(project.start_date)} />
            <Row label="Deadline" value={formatDate(project.end_date)} />
            <Row label="Status" value={project.status.replace('_', ' ')} />
          </dl>
        </section>

        <section className="rounded-2xl bg-white p-5 shadow dark:bg-zinc-900">
          <h2 className="mb-2 text-lg font-bold">Project Progress</h2>
          <div
            className="h-3 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700"
            role="progressbar"
            aria-valuenow={progress.percent}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div className="h-full rounded-full bg-green-500" style={{ width: `${progress.percent}%` }} />
          </div>
          <dl className="mt-3">
            <Row label="Total Task" value={String(progress.total)} />
            <Row label="Completed" value={String(progress.completed)} />
            <Row label="In Progress" value={String(progress.inProgress)} />
            <Row label="Blocked" value={String(progress.blocked)} />
            <Row label="Todo" value={String(progress.todo)} />
            <Row label="Progress" value={`${progress.percent}%`} />
          </dl>
        </section>
      </div>

      {/* WORKSTREAMS */}
      <section className="mt-6 rounded-2xl bg-white p-5 shadow dark:bg-zinc-900">
        <h2 className="text-lg font-bold">Workstreams ({wsList.length})</h2>
        {wsList.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500">No workstreams yet.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-3">
            {wsList.map((ws) => {
              const count = taskList.filter((t) => t.workstream_id === ws.id).length
              return (
                <li key={ws.id} className="rounded-xl border p-3 dark:border-zinc-700">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-semibold">
                        {ws.name}{' '}
                        <span className="text-xs font-normal text-zinc-500">
                          ({count} task{count === 1 ? '' : 's'})
                        </span>
                      </p>
                      {ws.description && (
                        <p className="text-sm text-zinc-500">{ws.description}</p>
                      )}
                    </div>
                    {canEditThis && canManageWorkstream && (
                      <div className="w-40">
                        <DeleteWorkstreamForm id={ws.id} />
                      </div>
                    )}
                  </div>
                  {canEditThis && canManageWorkstream && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-sm font-medium text-zinc-500">
                        Edit
                      </summary>
                      <div className="mt-2">
                        <EditWorkstreamForm
                          id={ws.id}
                          name={ws.name}
                          description={ws.description}
                        />
                      </div>
                    </details>
                  )}
                </li>
              )
            })}
          </ul>
        )}

        {canEditThis && canManageWorkstream && (
          <div className="mt-4">
            <CreateWorkstreamForm projectId={project.id} />
          </div>
        )}
      </section>

      {/* TASKS */}
      <section className="mt-6 rounded-2xl bg-white p-5 shadow dark:bg-zinc-900">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold">Tasks ({visibleTasks.length})</h2>
          <div className="flex gap-2">
            {can(profile.role, 'tasks.create') && canEditThis && (
              <Link
                href={`/tasks/new?project=${project.id}`}
                className="inline-flex min-h-[44px] items-center rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white dark:bg-white dark:text-black"
              >
                + Add Task
              </Link>
            )}
          </div>
        </div>

        <form method="get" className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
          <div>
            <label htmlFor="fws" className="mb-1 block text-xs font-medium">
              Workstream
            </label>
            <select
              id="fws"
              name="ws"
              defaultValue={fWs}
              className="min-h-[44px] rounded-lg border px-2 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
            >
              <option value="">All</option>
              {wsList.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
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
              defaultValue={fStatus}
              className="min-h-[44px] rounded-lg border px-2 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
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
            <label htmlFor="fpriority" className="mb-1 block text-xs font-medium">
              Priority
            </label>
            <select
              id="fpriority"
              name="priority"
              defaultValue={fPriority}
              className="min-h-[44px] rounded-lg border px-2 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
            >
              <option value="">All</option>
              {(['LOW', 'MEDIUM', 'HIGH'] as const).map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            className="min-h-[44px] rounded-lg border px-4 py-2 text-sm font-semibold"
          >
            Filter
          </button>
        </form>

        {visibleTasks.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-500">No tasks yet.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {visibleTasks.map((task) => (
              <li key={task.id}>
                <Link
                  href={`/tasks/${task.id}`}
                  className="flex flex-col gap-1 rounded-xl border p-3 hover:bg-zinc-50 sm:flex-row sm:items-center sm:justify-between dark:border-zinc-700 dark:hover:bg-zinc-800"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{task.title}</p>
                    <p className="truncate text-xs text-zinc-500">
                      {task.workstream_id ? (wsNames[task.workstream_id] ?? '-') : 'No workstream'}
                      {' '} &middot; {assigneeNames[task.assignee_id] ?? '-'}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <PriorityBadge priority={task.priority} />
                    <TaskStatusBadge status={task.status} />
                    {isOverdue(task.deadline, task.status) && <OverdueBadge />}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {canEditThis && canEditProject && (
        <section className="mt-6">
          <ProjectForm
            mode="edit"
            managers={managers}
            initial={{
              id: project.id,
              name: project.name,
              client: project.client,
              description: project.description,
              project_manager_ids: pmIds,
              start_date: project.start_date,
              end_date: project.end_date,
              status: project.status,
            }}
          />
        </section>
      )}
    </AppShell>
  )
}
