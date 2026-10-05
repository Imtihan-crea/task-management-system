import Link from 'next/link'
import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { requireProfile } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { getMeetingAccess } from '@/app/actions/meetings'
import { getActiveUsers } from '@/lib/data/users'
import { fetchMeetingById } from '@/lib/data/meetings'
import {
  canCreateTaskFromMeeting,
  canManageMeetingContent,
  canManageMeetingFull,
  canViewMeeting,
} from '@/lib/meetings/rules'
import { AppShell } from '@/components/layout/AppShell'
import { Tabs } from '@/components/ui/Tabs'
import { SkeletonRows } from '@/components/ui/Skeleton'
import { MeetingStatusBadge, MeetingTypeBadge } from '@/components/meetings/MeetingBadges'
import {
  ActionsSection,
  AgendaSection,
  DecisionsSection,
  MeetingActivitySection,
  NotesSection,
  OverviewSection,
} from '@/components/meetings/detail/MeetingWorkspace'
import {
  MEETING_DETAIL_TABS,
  MEETING_DETAIL_TAB_LABELS,
  parseMeetingDetailTab,
  type MeetingDetailTabKey,
} from '@/types/meeting'
import { formatMeetingDate, formatTimeRange } from '@/lib/utils/meeting-time'

export default async function MeetingDetailPage({
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
  const tab = parseMeetingDetailTab(str(query.tab) || undefined)

  const meeting = await fetchMeetingById(id)
  if (!meeting) notFound()

  const access = await getMeetingAccess(id, profile.id, profile.role)
  if (!access.meeting || !canViewMeeting(access, profile.role)) {
    notFound()
  }

  const canFull = canManageMeetingFull(access, profile.role)
  const canContent = canManageMeetingContent(access, profile.role)
  const canCreateTask = canCreateTaskFromMeeting(access, profile.role)
  const canPickOrganizer = profile.role === 'ADMIN' || profile.role === 'PROJECT_MANAGER'

  const admin = createAdminClient()
  const [{ data: project }, users, { data: wsData }] = await Promise.all([
    meeting.project_id
      ? admin
          .from('projects')
          .select('id, code, name')
          .eq('id', meeting.project_id)
          .maybeSingle<{ id: string; code: string; name: string }>()
      : Promise.resolve({ data: null as { id: string; code: string; name: string } | null }),
    getActiveUsers(),
    meeting.project_id
      ? admin
          .from('workstreams')
          .select('id, code, name')
          .eq('project_id', meeting.project_id)
          .order('name', { ascending: true })
          .limit(200)
      : Promise.resolve({ data: [] as { id: string; code: string; name: string }[] }),
  ])

  const nameOf = (uid: string | null) => {
    if (!uid) return '-'
    const u = users.find((x) => x.id === uid)
    return u ? u.full_name || u.email : '-'
  }

  const tabHref = (key: MeetingDetailTabKey) => {
    const params = new URLSearchParams()
    if (key !== 'overview') params.set('tab', key)
    const s = params.toString()
    return s ? `/meetings/${id}?${s}` : `/meetings/${id}`
  }

  const projectName = project ? `${project.code} · ${project.name}` : 'Global meeting'
  const timeLabel = `${formatMeetingDate(meeting.meeting_date)} · ${formatTimeRange(meeting.start_time, meeting.end_time)}`

  return (
    <AppShell>
      <Link href="/meetings" className="text-sm font-medium text-zinc-500 hover:underline">
        &larr; Back to Meetings
      </Link>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="rounded-md bg-zinc-100 px-2 py-1 font-mono text-sm dark:bg-zinc-800">
          {meeting.code}
        </span>
        <div className="flex flex-wrap items-center gap-1.5">
          <MeetingStatusBadge status={meeting.status} />
          <MeetingTypeBadge type={meeting.meeting_type} />
        </div>
      </div>
      <h1 className="mt-2 text-2xl font-bold">{meeting.title}</h1>
      <p className="mt-1 text-sm text-zinc-500">
        {project ? (
          <Link href={`/projects/${project.id}`} className="font-medium hover:underline">
            {projectName}
          </Link>
        ) : (
          projectName
        )}{' '}
        · {timeLabel}
      </p>
      <p className="mt-0.5 text-sm text-zinc-500">
        Organizer: {nameOf(meeting.organizer_id)}
      </p>

      <div className="mt-4">
        <Tabs
          label="Meeting workspace"
          items={MEETING_DETAIL_TABS.map((key) => ({
            key,
            label: MEETING_DETAIL_TAB_LABELS[key],
            href: tabHref(key),
            active: tab === key,
          }))}
        />
      </div>

      <div className="mt-4" key={tab}>
        {tab === 'overview' && (
          <Suspense fallback={<SkeletonRows rows={5} />}>
            <OverviewSection
              meeting={meeting}
              project={project}
              organizerName={nameOf(meeting.organizer_id)}
              creatorName={nameOf(meeting.created_by)}
              users={users}
              selfId={profile.id}
              canFull={canFull}
              canPickOrganizer={canPickOrganizer}
            />
          </Suspense>
        )}
        {tab === 'agenda' && (
          <Suspense fallback={<SkeletonRows rows={3} />}>
            <AgendaSection meetingId={id} canContent={canContent} />
          </Suspense>
        )}
        {tab === 'notes' && (
          <Suspense fallback={<SkeletonRows rows={3} />}>
            <NotesSection meetingId={id} notes={meeting.notes ?? ''} canContent={canContent} />
          </Suspense>
        )}
        {tab === 'decisions' && (
          <Suspense fallback={<SkeletonRows rows={3} />}>
            <DecisionsSection meetingId={id} canContent={canContent} />
          </Suspense>
        )}
        {tab === 'actions' && (
          <Suspense fallback={<SkeletonRows rows={4} />}>
            <ActionsSection
              meetingId={id}
              users={users}
              workstreams={(wsData ?? []) as { id: string; code: string; name: string }[]}
              canContent={canContent}
              canCreateTask={canCreateTask}
            />
          </Suspense>
        )}
        {tab === 'activity' && (
          <Suspense fallback={<SkeletonRows rows={5} />}>
            <MeetingActivitySection meetingId={id} />
          </Suspense>
        )}
      </div>
    </AppShell>
  )
}