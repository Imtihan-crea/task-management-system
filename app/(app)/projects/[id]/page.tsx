import Link from 'next/link'
import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { requireProfile } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { can } from '@/lib/auth/permissions'
import { AppShell } from '@/components/layout/AppShell'
import { ProjectStatusBadge } from '@/components/ui/Badges'
import { Tabs } from '@/components/ui/Tabs'
import { SkeletonCards, SkeletonRows } from '@/components/ui/Skeleton'
import { OverviewTab } from '@/components/projects/workspace/OverviewTab'
import { WorkstreamsTab } from '@/components/projects/workspace/WorkstreamsTab'
import { TasksTab } from '@/components/projects/workspace/TasksTab'
import { MeetingsTab } from '@/components/projects/workspace/MeetingsTab'
import { ActivityTab, MembersTab } from '@/components/projects/workspace/ActivityMembersTabs'
import { SettingsTab } from '@/components/projects/workspace/SettingsTab'
import { isProjectManager } from '@/lib/data/projects'
import type { Project } from '@/types/project'

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'workstreams', label: 'Workstreams' },
  { key: 'tasks', label: 'Tasks' },
  { key: 'meetings', label: 'Meetings' },
  { key: 'activity', label: 'Activity' },
  { key: 'members', label: 'Members' },
  { key: 'settings', label: 'Settings' },
] as const

type TabKey = (typeof TABS)[number]['key']

function parseTab(value: string | undefined): TabKey {
  return (TABS as readonly { key: string }[]).some((t) => t.key === value)
    ? (value as TabKey)
    : 'overview'
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
  const query = await searchParams
  const str = (v: string | string[] | undefined) => (typeof v === 'string' ? v : '')
  const tab = parseTab(str(query.tab))

  const canEditProject = can(profile.role, 'projects.edit')
  const canManageWorkstream = can(profile.role, 'workstreams.create')

  const admin = createAdminClient()
  const { data: project } = await admin
    .from('projects')
    .select('id, code, name, client, status')
    .eq('id', id)
    .single<Pick<Project, 'id' | 'code' | 'name' | 'client' | 'status'>>()

  if (!project) notFound()

  const isOwner =
    profile.role === 'ADMIN' ||
    (profile.role === 'PROJECT_MANAGER' && (await isProjectManager(id, profile.id)))
  const canEditThis = profile.role === 'ADMIN' || isOwner

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

  // Ringan: counts untuk badge tabs.
  const [{ count: wsCount }, { count: taskCount }, { count: meetingCount }] = await Promise.all([
    admin.from('workstreams').select('id', { count: 'exact', head: true }).eq('project_id', id),
    admin
      .from('tasks')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', id)
      .eq('is_deleted', false),
    admin.from('meetings').select('id', { count: 'exact', head: true }).eq('project_id', id),
  ])

  const counts: Record<TabKey, number | undefined> = {
    overview: undefined,
    workstreams: wsCount ?? 0,
    tasks: taskCount ?? 0,
    meetings: meetingCount ?? 0,
    activity: undefined,
    members: undefined,
    settings: undefined,
  }

  const tabHref = (key: TabKey) => {
    const params = new URLSearchParams()
    if (key !== 'overview') params.set('tab', key)
    // Pertahankan filter tasks saat pindah tab.
    for (const k of ['ws', 'status', 'priority']) {
      const v = str(query[k])
      if (v) params.set(k, v)
    }
    const s = params.toString()
    return s ? `/projects/${id}?${s}` : `/projects/${id}`
  }

  // Suggestions di project ini (ringkas, selalu terlihat).
  let projectSuggestions: { id: string; code: string; title: string; status: string }[] = []
  if (can(profile.role, 'suggestions.create') || canEditThis) {
    let sugQuery = admin
      .from('task_suggestions')
      .select('id, code, title, status')
      .eq('project_id', id)
      .order('created_at', { ascending: false })
      .limit(10)
    if (profile.role === 'TEAM_MEMBER') {
      sugQuery = sugQuery.eq('suggested_by', profile.id)
    }
    const { data: sug } = await sugQuery
    projectSuggestions = (sug ?? []) as typeof projectSuggestions
  }

  const fWs = str(query.ws)
  const fStatus = str(query.status)
  const fPriority = str(query.priority)

  return (
    <AppShell>
      <Link href="/projects" className="text-sm font-medium text-zinc-500 hover:underline">
        &larr; Back to Projects
      </Link>

      <div className="mt-2 flex flex-wrap items-center gap-3">
        <span className="rounded-md bg-zinc-100 px-2 py-1 font-mono text-sm dark:bg-zinc-800">
          {project.code}
        </span>
        <h1 className="text-2xl font-bold">{project.name}</h1>
        <ProjectStatusBadge status={project.status} />
      </div>
      <p className="mt-1 text-sm text-zinc-500">
        {project.client || 'No client'}
      </p>

      <div className="mt-4">
        <Tabs
          label="Project workspace"
          items={TABS.filter(
            (t) => t.key !== 'settings' || (canEditThis && canEditProject)
          ).map((t) => ({
            key: t.key,
            label: t.label,
            count: counts[t.key],
            href: tabHref(t.key),
            active: tab === t.key,
          }))}
        />
      </div>

      <div className="mt-4" key={tab}>
        {tab === 'overview' && (
          <Suspense fallback={<SkeletonCards count={2} />}>
            <OverviewTab projectId={id} />
          </Suspense>
        )}
        {tab === 'workstreams' && (
          <Suspense fallback={<SkeletonRows rows={3} />}>
            <WorkstreamsTab projectId={id} canManage={canEditThis && canManageWorkstream} />
          </Suspense>
        )}
        {tab === 'tasks' && (
          <Suspense
            key={`${fWs}-${fStatus}-${fPriority}`}
            fallback={<SkeletonRows rows={4} />}
          >
            <TasksTab
              projectId={id}
              canCreate={can(profile.role, 'tasks.create') && canEditThis}
              filters={{ ws: fWs, status: fStatus, priority: fPriority }}
            />
          </Suspense>
        )}
        {tab === 'meetings' && (
          <Suspense fallback={<SkeletonRows rows={3} />}>
            <MeetingsTab
              projectId={id}
              userId={profile.id}
              role={profile.role}
              canCreate={can(profile.role, 'meetings.create') && canEditThis}
            />
          </Suspense>
        )}
        {tab === 'activity' && (
          <Suspense fallback={<SkeletonRows rows={5} />}>
            <ActivityTab projectId={id} />
          </Suspense>
        )}
        {tab === 'members' && (
          <Suspense fallback={<SkeletonRows rows={3} />}>
            <MembersTab projectId={id} />
          </Suspense>
        )}
        {tab === 'settings' && canEditThis && canEditProject && (
          <Suspense fallback={<SkeletonRows rows={3} />}>
            <SettingsTab projectId={id} />
          </Suspense>
        )}
      </div>
      {/* SUGGESTIONS ringkas — entry point kontekstual per project */}
      {(can(profile.role, 'suggestions.create') || canEditThis) && (
        <section className="mt-6 rounded-2xl bg-white p-5 shadow dark:bg-zinc-900">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-bold">Suggestions</h2>
            {can(profile.role, 'suggestions.create') && (
              <Link
                href={`/task-suggestions/new?project=${id}`}
                className="inline-flex min-h-[44px] items-center rounded-lg border px-4 py-2 text-sm font-semibold"
              >
                + Suggest Task
              </Link>
            )}
          </div>
          {projectSuggestions.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-500">No suggestions yet.</p>
          ) : (
            <ul className="mt-3 flex flex-col gap-2">
              {projectSuggestions.map((s) => (
                <li key={s.id}>
                  <Link
                    href={`/task-suggestions/${s.id}`}
                    className="flex items-center justify-between gap-2 rounded-xl border p-3 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
                  >
                    <p className="truncate font-medium">
                      <span className="mr-2 rounded-md bg-zinc-100 px-1.5 py-0.5 font-mono text-xs dark:bg-zinc-800">
                        {s.code}
                      </span>
                      {s.title}
                    </p>
                    <span className="shrink-0 text-xs text-zinc-500">
                      {s.status.replace('_', ' ')}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </AppShell>
  )
}
