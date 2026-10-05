import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireProfile } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { AppShell } from '@/components/layout/AppShell'
import { PriorityBadge, TaskStatusBadge, OverdueBadge } from '@/components/ui/Badges'
import { formatDate, isOverdue } from '@/lib/utils/dates'
import { TaskForm } from '@/components/tasks/TaskForm'
import { ChangeStatusForm, DeleteTaskForm } from '@/components/tasks/TaskStatusForms'
import { EvidenceForm } from '@/components/tasks/EvidenceForm'
import {
  ActivityTimeline,
  resolveActorNames,
  type ActivityEntry,
} from '@/components/activity/ActivityTimeline'
import { getActiveUsers } from '@/lib/data/users'
import { isProjectManager } from '@/lib/data/projects'
import { can } from '@/lib/auth/permissions'
import type { Task, TaskStatus } from '@/types/task'

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 border-b py-2.5 last:border-0 sm:flex-row sm:justify-between sm:gap-4">
      <dt className="text-sm text-zinc-500">{label}</dt>
      <dd className="text-sm font-medium break-all">{value}</dd>
    </div>
  )
}

export default async function TaskDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const profile = await requireProfile()
  const { id } = await params

  const admin = createAdminClient()
  const { data: task } = await admin
    .from('tasks')
    .select('*')
    .eq('id', id)
    .eq('is_deleted', false)
    .single<Task>()

  if (!task) notFound()

  const isOwner = task.assignee_id === profile.id
  const isAdmin = profile.role === 'ADMIN'
  const isPM = profile.role === 'PROJECT_MANAGER'

  // Scope baca: member hanya task miliknya; PM hanya project miliknya.
  if (profile.role === 'TEAM_MEMBER' && !isOwner) {
    notFound()
  }
  let pmOwnsProject = false
  if (isPM) {
    pmOwnsProject = await isProjectManager(task.project_id, profile.id)
    if (!pmOwnsProject) {
      notFound()
    }
  }
  const canFullEdit = isAdmin || (isPM && pmOwnsProject)
  const canChangeStatus =
    isAdmin || (isPM && pmOwnsProject) || (profile.role === 'TEAM_MEMBER' && isOwner)
  const canDelete = isAdmin || (isPM && pmOwnsProject)
  const canSubmitEvidence =
    can(profile.role, 'tasks.submitEvidenceOwn') &&
    (isAdmin || (isPM && pmOwnsProject) || (profile.role === 'TEAM_MEMBER' && isOwner))

  const [{ data: project }, { data: workstream }, { data: assignee }, { data: creator }] =
    await Promise.all([
      admin.from('projects').select('id, code, name').eq('id', task.project_id).single<{ id: string; code: string; name: string }>(),
      task.workstream_id
        ? admin.from('workstreams').select('id, code, name').eq('id', task.workstream_id).single<{ id: string; code: string; name: string }>()
        : Promise.resolve({ data: null }),
      admin.from('profiles').select('full_name, email').eq('id', task.assignee_id).single<{ full_name: string | null; email: string }>(),
      task.created_by
        ? admin.from('profiles').select('full_name, email').eq('id', task.created_by).single<{ full_name: string | null; email: string }>()
        : Promise.resolve({ data: null }),
    ])

  // Data untuk form edit (hanya diambil kalau boleh edit penuh)
  const [projectsRes, workstreamsRes, users] = canFullEdit
    ? await Promise.all([
        admin.from('projects').select('id, code, name').order('name', { ascending: true }).limit(500),
        admin.from('workstreams').select('id, project_id, code, name').order('name', { ascending: true }).limit(1000),
        getActiveUsers(),
      ])
    : [{ data: [] }, { data: [] }, []]

  // Phase 11 traceability (§21): dari mana task ini berasal.
  let sourceBlock: { label: string; href: string | null } | null = null
  if (task.source_type === 'MEETING' && task.source_id) {
    const { data: meeting } = await admin
      .from('meetings')
      .select('id, code, title')
      .eq('id', task.source_id)
      .maybeSingle<{ id: string; code: string; title: string }>()
    sourceBlock = meeting
      ? { label: `Meeting ${meeting.code} · ${meeting.title}`, href: `/meetings/${meeting.id}` }
      : { label: 'Meeting (deleted)', href: null }
  } else if (task.source_type === 'SUGGESTION' && task.source_id) {
    const { data: suggestion } = await admin
      .from('task_suggestions')
      .select('id, code, title')
      .eq('id', task.source_id)
      .maybeSingle<{ id: string; code: string; title: string }>()
    sourceBlock = suggestion
      ? { label: `Suggestion ${suggestion.code} · ${suggestion.title}`, href: `/task-suggestions/${suggestion.id}` }
      : { label: 'Suggestion (deleted)', href: null }
  } else if (task.source_type === 'IMPORT') {
    sourceBlock = { label: 'Import', href: null }
  }

  // Activity timeline task ini.
  const { data: activityData } = await admin
    .from('activity_logs')
    .select('*')
    .eq('entity_type', 'task')
    .eq('entity_id', id)
    .order('created_at', { ascending: false })
    .limit(50)
  const taskActivity = (activityData ?? []) as ActivityEntry[]
  const activityActors = await resolveActorNames(taskActivity)

  return (
    <AppShell>
      <Link href="/tasks" className="text-sm font-medium text-zinc-500 hover:underline">
        &larr; Back to Tasks
      </Link>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="rounded-md bg-zinc-100 px-2 py-1 font-mono text-sm dark:bg-zinc-800">
          {task.code}
        </span>
        <h1 className="text-2xl font-bold">{task.title}</h1>
        <TaskStatusBadge status={task.status as TaskStatus} />
        <PriorityBadge priority={task.priority} />
        {isOverdue(task.deadline, task.status) && <OverdueBadge />}
      </div>

      <div className="mt-4 grid gap-6 lg:grid-cols-2 lg:items-start">
        <section className="rounded-2xl bg-white p-5 shadow dark:bg-zinc-900">
          <h2 className="mb-2 text-lg font-bold">Task Detail</h2>
          <dl>
            <Row label="Project" value={project ? `${project.code} · ${project.name}` : '-'} />
            <Row label="Workstream" value={workstream ? `${workstream.code} · ${workstream.name}` : '-'} />
            <Row label="Description" value={task.description || '-'} />
            <Row
              label="Assignee"
              value={assignee ? assignee.full_name || assignee.email : '-'}
            />
            <Row
              label="Created By"
              value={creator ? creator.full_name || creator.email : '-'}
            />
            <Row label="Priority" value={task.priority} />
            <Row label="Status" value={task.status.replace('_', ' ')} />
            <Row label="Start Date" value={formatDate(task.start_date)} />
            <Row label="Deadline" value={formatDate(task.deadline)} />
          </dl>

          {sourceBlock && (
            <div className="mt-4 border-t pt-4 dark:border-zinc-700">
              <h3 className="mb-2 text-base font-bold">Source</h3>
              {sourceBlock.href ? (
                <Link
                  href={sourceBlock.href}
                  className="text-sm font-medium text-kasuat-deep-gold hover:underline"
                >
                  {sourceBlock.label} — View
                </Link>
              ) : (
                <p className="text-sm text-zinc-500">{sourceBlock.label}</p>
              )}
            </div>
          )}

          {canChangeStatus && (
            <div className="mt-4 border-t pt-4 dark:border-zinc-700">
              <ChangeStatusForm id={task.id} current={task.status as TaskStatus} />
            </div>
          )}

          <div className="mt-4 border-t pt-4 dark:border-zinc-700">
            <h3 className="mb-2 text-base font-bold">Evidence</h3>
            <EvidenceForm
              id={task.id}
              current={task.evidence_url}
              canSubmit={canSubmitEvidence}
            />
          </div>

          {canDelete && (
            <div className="mt-4 max-w-[220px]">
              <DeleteTaskForm id={task.id} />
            </div>
          )}

          <div className="mt-4 border-t pt-4 dark:border-zinc-700">
            <h3 className="mb-2 text-base font-bold">Activity</h3>
            <ActivityTimeline entries={taskActivity} actorNames={activityActors} />
          </div>
        </section>

        {canFullEdit && (
          <section className="rounded-2xl bg-white p-5 shadow dark:bg-zinc-900">
            <h2 className="mb-4 text-lg font-bold">Edit Task</h2>
            <TaskForm
              mode="edit"
              projects={(projectsRes.data ?? []) as { id: string; code: string; name: string }[]}
              workstreams={(workstreamsRes.data ?? []) as { id: string; project_id: string; code: string; name: string }[]}
              users={users}
              initial={{
                id: task.id,
                title: task.title,
                description: task.description,
                project_id: task.project_id,
                workstream_id: task.workstream_id,
                assignee_id: task.assignee_id,
                priority: task.priority,
                status: task.status as TaskStatus,
                start_date: task.start_date,
                deadline: task.deadline,
              }}
            />
          </section>
        )}
      </div>
    </AppShell>
  )
}
