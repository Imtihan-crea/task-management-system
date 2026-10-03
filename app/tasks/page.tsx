import { Suspense } from 'react'
import { requireProfile } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { can } from '@/lib/auth/permissions'
import { AppShell } from '@/components/layout/AppShell'
import { ButtonLink, PageHeader } from '@/components/ui/primitives'
import { SkeletonRows, SkeletonTable } from '@/components/ui/Skeleton'
import { TaskTabs, parseTaskTab } from '@/components/tasks/TaskTabs'
import { TaskResults } from '@/components/tasks/TaskResults'
import { DebouncedTaskSearch } from '@/components/tasks/TaskSearch'
import { parsePage } from '@/components/ui/Pagination'

function sanitize(value: string | undefined): string {
  return (value ?? '').replace(/[,()*%]/g, ' ').trim().slice(0, 60)
}

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

  const params = await searchParams
  const str = (v: string | string[] | undefined) => (typeof v === 'string' ? v : '')

  const q = sanitize(str(params.q))
  const tab = parseTaskTab(str(params.view))
  const fProject = str(params.project)
  const fWorkstream = str(params.workstream)
  const fStatus = str(params.status)
  const fPriority = str(params.priority)
  const fDeadline = str(params.deadline)
  const sort = str(params.sort) || 'deadline.asc'
  const page = parsePage(params.page)

  const admin = createAdminClient()
  const [projectsRes, workstreamsRes] = await Promise.all([
    admin.from('projects').select('id, code, name').limit(500),
    admin.from('workstreams').select('id, project_id, code, name').limit(1000),
  ])
  const projectList = (projectsRes.data ?? []) as { id: string; code: string; name: string }[]
  const workstreamList = (workstreamsRes.data ?? []) as { id: string; project_id: string; code: string; name: string }[]

  const tabBase: Record<string, string> = {}
  if (q) tabBase.q = q
  if (fProject) tabBase.project = fProject
  if (fWorkstream) tabBase.workstream = fWorkstream
  if (fPriority) tabBase.priority = fPriority
  if (fDeadline) tabBase.deadline = fDeadline
  if (sort !== 'deadline.asc') tabBase.sort = sort

  const resultsKey = JSON.stringify({ q, tab, fProject, fWorkstream, fStatus, fPriority, fDeadline, sort, page, user: profile.id })

  return (
    <AppShell>
      <PageHeader
        title="Tasks"
        subtitle="Kelola semua task, pantau progress, dan pastikan semua selesai tepat waktu."
        actions={
          <>
            {canCreate && <ButtonLink href="/tasks/new">+ Add Task</ButtonLink>}
            {can(profile.role, 'suggestions.create') && (
              <ButtonLink href="/task-suggestions/new" variant="secondary">
                + Suggest Task
              </ButtonLink>
            )}
          </>
        }
      />

      <div className="mt-4">
        <Suspense fallback={<div className="h-10 animate-pulse rounded-lg bg-zinc-100 dark:bg-zinc-800" />}>
          <TaskTabs
            scope={{
              userId: profile.id,
              role: profile.role,
              projectId: fProject || undefined,
              workstreamId: fWorkstream || undefined,
              priority: fPriority || undefined,
              deadline: fDeadline || undefined,
            }}
            tab={tab}
            userId={profile.id}
            baseParams={tabBase}
          />
        </Suspense>
      </div>

      <form
        method="get"
        className="mt-4 flex flex-col gap-3 rounded-2xl bg-white p-4 shadow dark:bg-zinc-900"
      >
        {tab !== 'all' && <input type="hidden" name="view" value={tab === 'mine' ? 'mine' : tab} />}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="sm:col-span-2 lg:col-span-1">
            <DebouncedTaskSearch key={q} initial={q} />
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
            <label htmlFor="workstream" className="mb-1 block text-sm font-medium">
              Workstream
            </label>
            <select
              id="workstream"
              name="workstream"
              defaultValue={fWorkstream}
              className="min-h-[44px] w-full rounded-lg border px-3 py-2 text-base dark:border-zinc-700 dark:bg-zinc-800"
            >
              <option value="">All</option>
              {workstreamList
                .filter((w) => !fProject || w.project_id === fProject)
                .map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.code} · {w.name}
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
          className="min-h-[44px] rounded-lg bg-kasuat-gold px-5 py-2 font-semibold text-kasuat-black sm:w-auto"
        >
          Apply
        </button>
      </form>

      <Suspense
        key={resultsKey}
        fallback={
          <div className="mt-4">
            <div className="md:hidden">
              <SkeletonRows rows={4} />
            </div>
            <SkeletonTable rows={6} />
          </div>
        }
      >
        <div className="mt-1">
          <TaskResults
            filters={{
              q,
              tab,
              userId: profile.id,
              role: profile.role,
              project: fProject,
              workstream: fWorkstream,
              status: fStatus,
              priority: fPriority,
              deadline: fDeadline,
              sort,
              page,
            }}
          />
        </div>
      </Suspense>
    </AppShell>
  )
}
