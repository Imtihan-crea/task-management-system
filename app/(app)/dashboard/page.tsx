import Link from 'next/link'
import { Suspense } from 'react'
import { requireProfile } from '@/lib/auth/session'
import { AppShell } from '@/components/layout/AppShell'
import { SkeletonCards, SkeletonGantt, SkeletonRows } from '@/components/ui/Skeleton'
import { ProjectGantt } from '@/components/dashboard/ProjectGantt'
import {
  ChartsSection,
  FilterSection,
  KpiSection,
  SuggestionsSection,
  UpcomingSection,
  WorkloadSection,
} from '@/components/dashboard/Sections'
import {
  ActivityTimeline,
  resolveActorNames,
  type ActivityEntry,
} from '@/components/activity/ActivityTimeline'
import { createClient as createUserClient } from '@/lib/supabase/server'
import type { DashboardFilters } from '@/lib/data/dashboard'

function sanitize(value: string | undefined): string {
  return (value ?? '').replace(/[,()*%]/g, ' ').trim().slice(0, 60)
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
    <section className="mt-6 rounded-2xl bg-white p-4 shadow dark:bg-zinc-900">
      <h2 className="mb-3 text-lg font-bold">Recent Activity</h2>
      <ActivityTimeline entries={entries} actorNames={actorNames} />
    </section>
  )
}

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

  const filters: DashboardFilters = {
    project: isAdmin || isPM ? sanitize(str(params.project)) : '',
    assignee: isAdmin || isPM ? sanitize(str(params.assignee)) : '',
    status: isAdmin || isPM ? str(params.status) : '',
    priority: isAdmin || isPM ? str(params.priority) : '',
  }

  const ganttView = str(params.gantt) === 'week' ? 'week' : 'month'
  const gOffset = parseInt(str(params.goffset) || '0', 10) || 0
  const gProject = str(params.gproject)

  const denied = params.denied === '1'
  const sectionKey = JSON.stringify({ ...filters, user: profile.id })

  return (
    <AppShell>
      {denied && (
        <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm font-medium text-red-700 dark:bg-red-950 dark:text-red-300">
          You do not have permission to perform this action.
        </p>
      )}

      <h1 className="text-xl font-bold">
        Selamat datang, {profile.full_name || profile.email} 👋
      </h1>
      <p className="mt-0.5 text-sm text-zinc-500">
        Berikut ringkasan aktivitas dan progress project di Kasuat.
      </p>

      {(isAdmin || isPM) && (
        <Suspense
          fallback={<div className="mt-4 h-24 animate-pulse rounded-2xl bg-zinc-100 dark:bg-zinc-800" />}
        >
          <FilterSection filters={filters} />
        </Suspense>
      )}

      <Suspense
        key={`kpi-${sectionKey}`}
        fallback={<div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">{[0, 1, 2, 3].map((i) => (<div key={i} className="h-20 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-800" />))}</div>}
      >
        <KpiSection userId={profile.id} role={role} filters={filters} />
      </Suspense>

      <section className="mt-6 rounded-2xl bg-white p-4 shadow dark:bg-zinc-900">
        <h2 className="mb-3 text-lg font-bold">Timeline Project (Gantt Chart)</h2>
        <Suspense
          key={`gantt-${ganttView}-${gOffset}-${gProject}`}
          fallback={<SkeletonGantt rows={5} />}
        >
          <ProjectGantt view={ganttView} offset={gOffset} projectId={gProject || undefined} />
        </Suspense>
      </section>

      <Suspense
        key={`charts-${sectionKey}`}
        fallback={<div className="mt-6 grid gap-6 lg:grid-cols-2"><SkeletonCards count={2} /></div>}
      >
        <ChartsSection userId={profile.id} role={role} filters={filters} />
      </Suspense>

      <Suspense
        key={`up-${sectionKey}`}
        fallback={<div className="mt-6 grid gap-6 lg:grid-cols-3"><SkeletonCards count={3} /></div>}
      >
        <UpcomingSection userId={profile.id} role={role} filters={filters} />
      </Suspense>

      <Suspense fallback={<SkeletonRows rows={3} />}>
        <WorkloadSection userId={profile.id} role={role} filters={filters} />
      </Suspense>

      <Suspense fallback={<SkeletonRows rows={3} />}>
        <SuggestionsSection userId={profile.id} role={role} />
      </Suspense>

      <Suspense fallback={<SkeletonRows rows={4} />}>
        <RecentActivity />
      </Suspense>

      <div className="mt-6 flex flex-wrap gap-2">
        <Link href="/projects" className="inline-flex min-h-[40px] items-center rounded-lg border px-4 py-2 text-sm font-semibold">Projects</Link>
        <Link href="/tasks" className="inline-flex min-h-[40px] items-center rounded-lg border px-4 py-2 text-sm font-semibold">Tasks</Link>
        <Link href="/tasks?view=mine" className="inline-flex min-h-[40px] items-center rounded-lg border px-4 py-2 text-sm font-semibold">
          My Tasks
        </Link>
      </div>
    </AppShell>
  )
}
