import Link from 'next/link'
import { requireProfile } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { hasPermission, managedProjects } from '@/lib/auth/current-access'
import { PROJECT_STATUSES, seesOwnProjectsOnly } from '@/lib/auth/roles'
import { AppShell } from '@/components/layout/AppShell'
import { ProjectStatusBadge } from '@/components/ui/Badges'
import { formatDate } from '@/lib/utils/dates'
import { ButtonLink, FIELD, FIELD_LABEL, FILTER_GRID, FilterPanel, PageHeader, SUBMIT } from '@/components/ui/primitives'
import type { Project, ProjectProgress, ProjectStatus } from '@/types/project'
import { allRows } from '@/lib/utils/paginate'
import { BulkBar, BulkCheckbox, BulkSelectProvider } from '@/components/ui/BulkSelect'
import { bulkSetProjectStatus } from '@/app/actions/projects'

function sanitize(value: string | undefined): string {
  return (value ?? '').replace(/[,()*%]/g, ' ').trim().slice(0, 60)
}

type TaskCount = { project_id: string; status: string }

async function getProgressMap(projectIds: string[]): Promise<Record<string, ProjectProgress>> {
  if (projectIds.length === 0) return {}

  const admin = createAdminClient()
  const rows = await allRows<TaskCount>((from, to) =>
    admin
      .from('tasks')
      .select('project_id, status')
      .in('project_id', projectIds)
      .eq('is_deleted', false)
      .order('id')
      .range(from, to)
  )
  const map: Record<string, ProjectProgress> = {}

  for (const id of projectIds) {
    map[id] = { total: 0, completed: 0, inProgress: 0, blocked: 0, todo: 0, percent: 0 }
  }

  for (const row of rows) {
    const entry = map[row.project_id]
    if (!entry) continue
    // CANCELLED keluar dari progress (di luar scope).
    if (row.status === 'CANCELLED') continue
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
  const [canCreate, canEdit] = await Promise.all([
    hasPermission(profile.id, 'projects.create'),
    hasPermission(profile.id, 'projects.edit'),
  ])

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
    .select('id, code, name, client, end_date, status, created_at')
    .order('created_at', { ascending: false })
    .limit(200)

  if (q) query = query.or(`code.ilike.${q}%,name.ilike.%${q}%,client.ilike.%${q}%`)
  if (statusFilter) query = query.eq('status', statusFilter)

  const { data, error } = await query
  const projects = (data ?? []) as Project[]

  // PM setiap project dari tabel relasi (multi-PM).
  const projectIds = projects.map((p) => p.id)
  const pmNames: Record<string, string[]> = {}
  if (projectIds.length > 0) {
    const { data: links } = await admin
      .from('project_managers')
      .select('project_id, user_id')
      .in('project_id', projectIds)

    const linkRows = (links ?? []) as { project_id: string; user_id: string }[]
    const pmIds = [...new Set(linkRows.map((l) => l.user_id))]

    let pmLabels: Record<string, string> = {}
    if (pmIds.length > 0) {
      const { data: pms } = await admin
        .from('profiles')
        .select('id, full_name, email')
        .in('id', pmIds)

      pmLabels = Object.fromEntries(
        ((pms ?? []) as { id: string; full_name: string | null; email: string }[]).map(
          (pm) => [pm.id, pm.full_name || pm.email]
        )
      )
    }

    for (const p of projectIds) pmNames[p] = []
    for (const link of linkRows) {
      pmNames[link.project_id].push(pmLabels[link.user_id] ?? '-')
    }
  }

  // Project Officer / Guest hanya melihat project yang dia terlibat (punya task aktif di sana)
  // atau yang boleh ia kelola lewat aturan per akun.
  let visibleProjects = projects
  const granted = seesOwnProjectsOnly(profile.role) ? await managedProjects(profile.id) : null
  if (granted && !granted.all) {
    const { data: myTasks } = await admin
      .from('tasks')
      .select('project_id')
      .eq('assignee_id', profile.id)
      .eq('is_deleted', false)
      .limit(1000)

    const myProjectIds = new Set([
      ...((myTasks ?? []) as { project_id: string }[]).map((t) => t.project_id),
      ...granted.ids,
    ])
    visibleProjects = projects.filter((p) => myProjectIds.has(p.id))
  }

  // Filter PM by name (dilakukan di server setelah join nama)
  const pmQuery = sanitize(typeof params.pm === 'string' ? params.pm : undefined).toLowerCase()
  if (pmQuery) {
    visibleProjects = visibleProjects.filter((p) =>
      (pmNames[p.id] ?? []).join(' ').toLowerCase().includes(pmQuery)
    )
  }

  const progressMap = await getProgressMap(visibleProjects.map((p) => p.id))

  return (
    <AppShell>
      <PageHeader
        title="Projects"
        subtitle={`${visibleProjects.length} project`}
        actions={
          <>
            {canCreate && <ButtonLink href="/projects/new">+ Tambah Project</ButtonLink>}
            <ButtonLink href="/tasks?view=mine" variant="secondary">
              Task Saya
            </ButtonLink>
          </>
        }
      />

      <FilterPanel active={[q, statusFilter, pmQuery].filter(Boolean).length}>
      <form method="get" className={FILTER_GRID}>
        <div className="sm:col-span-2">
          <label htmlFor="q" className={FIELD_LABEL}>
            Cari
          </label>
          <input
            id="q"
            name="q"
            type="search"
            defaultValue={q}
            placeholder="Kode, nama project, atau client"
            className={FIELD}
          />
        </div>
        <div>
          <label htmlFor="status" className={FIELD_LABEL}>
            Status
          </label>
          <select
            id="status"
            name="status"
            defaultValue={statusFilter}
            className={FIELD}
          >
            <option value="">Semua</option>
            {PROJECT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.replace('_', ' ')}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="pm" className={FIELD_LABEL}>
            Project Manager
          </label>
          <input
            id="pm"
            name="pm"
            defaultValue={pmQuery}
            placeholder="Nama PM"
            className={FIELD}
          />
        </div>
        <button type="submit" className={SUBMIT}>
          Terapkan
        </button>
      </form>
      </FilterPanel>

      {error ? (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm font-medium text-red-700 dark:bg-red-950 dark:text-red-300">
          Terjadi kesalahan. Silakan coba lagi.
        </p>
      ) : visibleProjects.length === 0 ? (
        <p className="mt-4 rounded-2xl bg-white p-8 text-center text-sm text-zinc-600 dark:text-zinc-400 shadow dark:bg-zinc-900">
          Belum ada Project. {canCreate ? 'Buat Project pertama Anda di bawah.' : ''}
        </p>
      ) : (
        <BulkSelectProvider ids={visibleProjects.map((p) => p.id)}>
        <BulkBar
          noun="project"
          actions={
            canEdit
              ? [
                  {
                    key: 'status',
                    label: 'Ubah status',
                    run: bulkSetProjectStatus,
                    select: { name: 'status', label: 'Status baru', options: PROJECT_STATUSES.map((s) => ({ value: s, label: s.replace('_', ' ') })) },
                  },
                ]
              : []
          }
        />
        <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {visibleProjects.map((project) => {
            const progress = progressMap[project.id] ?? {
              total: 0, completed: 0, inProgress: 0, blocked: 0, todo: 0, percent: 0,
            }
            return (
              <li key={project.id} className="flex items-start rounded-2xl bg-white shadow-sm hover:shadow-md dark:bg-zinc-900">
                <BulkCheckbox id={project.id} label={`${project.code} ${project.name}`} className="mt-2 ml-1 sm:mt-3" />
                <Link
                  href={`/projects/${project.id}`}
                  className="block min-w-0 flex-1 rounded-2xl py-4 pr-4 pl-1 sm:py-5 sm:pr-5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-bold">
                        <span className="mr-2 rounded-md bg-zinc-100 px-1.5 py-0.5 font-mono text-xs dark:bg-zinc-800">
                          {project.code}
                        </span>
                        {project.name}
                      </p>
                      <p className="truncate text-sm text-zinc-600 dark:text-zinc-400">
                        {project.client || 'Tanpa client'} &middot;{' '}
                        {(pmNames[project.id] ?? []).join(', ') || '-'}
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
                      aria-label={`Progress ${progress.percent} persen`}
                    >
                      <div
                        className="h-full rounded-full bg-kasuat-gold"
                        style={{ width: `${progress.percent}%` }}
                      />
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-600 dark:text-zinc-400">
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
        </BulkSelectProvider>
      )}

    </AppShell>
  )
}
