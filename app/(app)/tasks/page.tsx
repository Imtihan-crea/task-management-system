import { Suspense } from 'react'
import { requireProfile } from '@/lib/auth/session'
import { can } from '@/lib/auth/permissions'
import { AppShell } from '@/components/layout/AppShell'
import { ButtonLink, PageHeader } from '@/components/ui/primitives'
import { SkeletonRows, SkeletonTable } from '@/components/ui/Skeleton'
import { TaskTabs, parseTaskTab } from '@/components/tasks/TaskTabs'
import { TaskResults } from '@/components/tasks/TaskResults'
import { TaskFilterForm } from '@/components/tasks/TaskFilterForm'
import { parsePage } from '@/components/ui/Pagination'

function sanitize(value: string | undefined): string {
  return (value ?? '').replace(/[,()*%]/g, ' ').trim().slice(0, 60)
}

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

      {/* Halaman ini tidak lagi menunggu query: semua area di bawah
          Suspense sendiri, jadi header tampil instan dan tiap area
          hanya me-refresh dirinya sendiri saat filter berubah. */}
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

      <Suspense
        fallback={
          <div className="mt-4 h-40 animate-pulse rounded-2xl bg-white shadow dark:bg-zinc-900" />
        }
      >
        <TaskFilterForm
          state={{
            q,
            tab,
            project: fProject,
            workstream: fWorkstream,
            status: fStatus,
            priority: fPriority,
            deadline: fDeadline,
            sort,
          }}
        />
      </Suspense>

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