import Link from 'next/link'
import { requireProfile } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { can } from '@/lib/auth/permissions'
import { PROJECT_STATUSES } from '@/lib/auth/roles'
import { AppShell } from '@/components/layout/AppShell'
import { ProjectStatusBadge } from '@/components/ui/Badges'
import { formatDate } from '@/lib/utils/dates'
import { ProjectForm } from '@/components/projects/ProjectForm'
import { getActiveUsers } from '@/lib/data/users'
import type { Project, ProjectProgress, ProjectStatus } from '@/types/project'

function sanitize(value: string | undefined): string {
  return (value ?? '').replace(/[,()*%]/g, ' ').trim().slice(0, 60)
}

type TaskCount = { project_id: string; status: string }

async function getProgressMap(projectIds: string[]): Promise<Record<string, ProjectProgress>> {
  if (projectIds.length === 0) return {}

  const admin = createAdminClient()
  const { data } = await admin
    .from('tasks')
    .select('project_id, status')
    .in('project_id', projectIds)
    .eq('is_deleted', false)
    .limit(5000)

  const rows = (data ?? []) as TaskCount[]
  const map: Record<string, ProjectProgress> = {}

  for (const id of projectIds) {
    map[id] = { total: 0, completed: 0, inProgress: 0, blocked: 0, todo: 0, percent: 0 }
  }

  for (const row of rows) {
    const entry = map[row.project_id]
    if (!entry) continue
    entry.total += 1
    if (row.status === 'DONE') entry.completed += 1
    else if (row.status === 'IN_PROGRESS') entry.inProgress += 1
    else if (row.status === 'BLOCKED') entry.blocked += 1
    else entry.todo += 1
  }

  for (const id of projectIds) {
    const entry = map[id]
    entry.percent = entry.total === 0 ? 0 : Math.round((entry.completed / entry.total) * 100)
  }

  return map
}

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const profile = await requireProfile()
  const canCreate = can(profile.role, 'projects.create')

  const params = await searchParams
  const q = sanitize(typeof params.q === 'string' ? params.q : undefined)
  const statusFilter =
    typeof params.status === 'string' &&
    (PROJECT_STATUSES as string[]).includes(params.status)
      ? (params.status as ProjectStatus)
      : ''

  const admin = createAdminClient()
  let query = admin
    .from('projects')
    .select('id, name, client, project_manager_id, end_date, status, created_at')
    .order('created_at', { ascending: false })
    .limit(200)

  if (q) query = query.or(`name.ilike.%${q}%,client.ilike.%${q}%`)
  if (statusFilter) query = query.eq('status', statusFilter)

  const { data, error } = await query
  const projects = (data ?? []) as Project[]

  // Nama PM untuk search/filter tampilan
  const pmIds = [...new Set(projects.map((p) => p.project_manager_id).filter(Boolean))] as string[]
  let pmNames: Record<string, string> = {}
  if (pmIds.length > 0) {
    const { data: pms } = await admin
      .from('profiles')
      .select('id, full_name, email')
      .in('id', pmIds)

    pmNames = Object.fromEntries(
      ((pms ?? []) as { id: string; full_name: string | null; email: string }[]).map(
        (pm) => [pm.id, pm.full_name || pm.email]
      )
    )
  }

  // Filter PM by name (dilakukan di server setelah join nama)
  const pmQuery = sanitize(typeof params.pm === 'string' ? params.pm : undefined).toLowerCase()
  const visibleProjects = pmQuery
    ? projects.filter((p) =>
        (p.project_manager_id ? (pmNames[p.project_manager_id] ?? '').toLowerCase() : '').includes(pmQuery)
      )
    : projects

  const progressMap = await getProgressMap(visibleProjects.map((p) => p.id))
  const managers = canCreate ? await getActiveUsers(['ADMIN', 'PROJECT_MANAGER']) : []

  return (
    <AppShell>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Projects</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {visibleProjects.length} project
            {canCreate ? ' — buat project baru di bawah.' : '.'}
          </p>
        </div>
        <Link
          href="/tasks?view=mine"
          className="inline-flex min-h-[44px] items-center rounded-lg border px-4 py-2 text-sm font-semibold"
        >
          My Tasks
        </Link>
      </div>

      <form
        method="get"
        className="mt-4 flex flex-col gap-3 rounded-2xl bg-white p-4 shadow sm:flex-row sm:items-end dark:bg-zinc-900"
      >
        <div className="flex-1">
          <label htmlFor="q" className="mb-1 block text-sm font-medium">
            Search
          </label>
          <input
            id="q"
            name="q"
            type="search"
            defaultValue={q}
            placeholder="Nama project atau client"
            className="min-h-[44px] w-full rounded-lg border px-3 py-2 text-base outline-none focus:border-black dark:border-zinc-700 dark:bg-zinc-800"
          />
        </div>
        <div>
          <label htmlFor="status" className="mb-1 block text-sm font-medium">
            Status
          </label>
          <select
            id="status"
            name="status"
            defaultValue={statusFilter}
            className="min-h-[44px] rounded-lg border px-3 py-2 text-base dark:border-zinc-700 dark:bg-zinc-800"
          >
            <option value="">All</option>
            {PROJECT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.replace('_', ' ')}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="pm" className="mb-1 block text-sm font-medium">
            Project Manager
          </label>
          <input
            id="pm"
            name="pm"
            defaultValue={pmQuery}
            placeholder="Nama PM"
            className="min-h-[44px] rounded-lg border px-3 py-2 text-base dark:border-zinc-700 dark:bg-zinc-800"
          />
        </div>
        <button
          type="submit"
          className="min-h-[44px] rounded-lg bg-black px-5 py-2 font-semibold text-white dark:bg-white dark:text-black"
        >
          Apply
        </button>
      </form>

      {error ? (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm font-medium text-red-700 dark:bg-red-950 dark:text-red-300">
          Something went wrong. Please try again.
        </p>
      ) : visibleProjects.length === 0 ? (
        <p className="mt-4 rounded-2xl bg-white p-8 text-center text-sm text-zinc-500 shadow dark:bg-zinc-900">
          No projects yet. {canCreate ? 'Create your first project below.' : ''}
        </p>
      ) : (
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {visibleProjects.map((project) => {
            const progress = progressMap[project.id] ?? {
              total: 0, completed: 0, inProgress: 0, blocked: 0, todo: 0, percent: 0,
            }
            return (
              <li key={project.id}>
                <Link
                  href={`/projects/${project.id}`}
                  className="block rounded-2xl bg-white p-5 shadow hover:shadow-md dark:bg-zinc-900"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-bold">{project.name}</p>
                      <p className="truncate text-sm text-zinc-500">
                        {project.client || 'No client'} &middot;{' '}
                        {project.project_manager_id
                          ? (pmNames[project.project_manager_id] ?? '-')
                          : '-'}
                      </p>
                    </div>
                    <ProjectStatusBadge status={project.status} />
                  </div>

                  <div className="mt-3">
                    <div
                      className="h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700"
                      role="progressbar"
                      aria-valuenow={progress.percent}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`Progress ${progress.percent} percent`}
                    >
                      <div
                        className="h-full rounded-full bg-green-500"
                        style={{ width: `${progress.percent}%` }}
                      />
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500">
                      <span>Total {progress.total}</span>
                      <span>Done {progress.completed}</span>
                      <span>{progress.percent}%</span>
                      <span className="ml-auto">
                        Deadline {formatDate(project.end_date)}
                      </span>
                    </div>
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      )}

      {canCreate && (
        <div className="mt-6">
          <ProjectForm mode="create" managers={managers} />
        </div>
      )}
    </AppShell>
  )
}
