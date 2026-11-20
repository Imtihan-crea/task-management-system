import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireProfile } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { AppShell } from '@/components/layout/AppShell'
import { PriorityBadge, TaskStatusBadge, OverdueBadge } from '@/components/ui/Badges'
import { formatDate, formatDateTime, showsOverdueBadge } from '@/lib/utils/dates'
import { TaskForm } from '@/components/tasks/TaskForm'
import { CancelTaskForm, ChangeStatusForm, DeleteTaskForm, ReviewDecisionForm, SubmitTaskForm } from '@/components/tasks/TaskStatusForms'
import { EvidenceForm } from '@/components/tasks/EvidenceForm'
import { TransferRequestForm } from '@/components/tasks/TransferForms'
import { TransferCard } from '@/components/tasks/TransferCard'
import { openTransferForTask, transferDurations, transferUsers } from '@/lib/data/task-transfers'
import {
  ActivityTimeline,
  resolveActorNames,
  type ActivityEntry,
} from '@/components/activity/ActivityTimeline'
import { getActiveUsers } from '@/lib/data/users'
import { applyProjectScope, hasPermission, permissionProjects } from '@/lib/auth/current-access'
import { can } from '@/lib/auth/permissions'
import { canActOnTask } from '@/lib/auth/task-access'
import type { Task, TaskStatus } from '@/types/task'
import { taskStatusLabel } from '@/lib/auth/roles'

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 border-b py-2.5 last:border-0 sm:flex-row sm:justify-between sm:gap-4">
      <dt className="text-sm text-zinc-600 dark:text-zinc-400">{label}</dt>
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
  // Izin di project task ini: peran + aturan per akun (lib/auth/access.ts).
  const [canFullEdit, canDelete, canCancel] = await Promise.all([
    hasPermission(profile.id, 'tasks.edit', task.project_id),
    hasPermission(profile.id, 'tasks.delete', task.project_id),
    hasPermission(profile.id, 'tasks.cancel', task.project_id),
  ])

  // Scope baca: assignee, atau pemegang izin kelola task di project ini
  // (Admin, PM project; audit A4: link email TASK_ASSIGNED tidak 404).
  // Guest hanya task miliknya (COA, 19 Nov 2026; sebelumnya Viewer membaca semua).
  if (!isOwner && !canFullEdit && !canDelete && !canCancel) {
    notFound()
  }
  // Sama dengan canActOnLoadedTask di server action.
  const canChangeStatus =
    canFullEdit ||
    (profile.role === 'ADMIN' ? isOwner : canActOnTask(profile.role, { isAssignee: isOwner, managesProject: false }))
  const canSubmitEvidence = can(profile.role, 'tasks.submitEvidenceOwn') && canChangeStatus

  // Alih task (20 Nov 2026): assignee mengajukan, PM/Admin project langsung mengalihkan.
  const isOpenTask = task.status !== 'DONE' && task.status !== 'CANCELLED'
  const openTransfer = await openTransferForTask(task.id)
  const canTransfer = isOpenTask && (canFullEdit || (isOwner && canChangeStatus))
  const [transferCandidates, durations] = canTransfer && !openTransfer ? await Promise.all([transferUsers(), transferDurations()]) : [[], []]

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

  // Data untuk form edit (hanya diambil kalau boleh edit penuh).
  // PM: dropdown project hanya project miliknya (audit C3; server menolak
  // pindah ke project PM lain).
  const projectsQuery = applyProjectScope(
    admin.from('projects').select('id, code, name').order('name', { ascending: true }).limit(500),
    await permissionProjects(profile.id, 'tasks.edit')
  )
  const [projectsRes, workstreamsRes, users] = canFullEdit
    ? await Promise.all([
        projectsQuery,
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
      : { label: 'Meeting (dihapus)', href: null }
  } else if (task.source_type === 'SUGGESTION' && task.source_id) {
    const { data: suggestion } = await admin
      .from('task_suggestions')
      .select('id, code, title')
      .eq('id', task.source_id)
      .maybeSingle<{ id: string; code: string; title: string }>()
    sourceBlock = suggestion
      ? { label: `Suggestion ${suggestion.code} · ${suggestion.title}`, href: `/task-suggestions/${suggestion.id}` }
      : { label: 'Suggestion (dihapus)', href: null }
  } else if (task.source_type === 'IMPORT') {
    sourceBlock = { label: 'Import', href: null }
  }

  // Activity timeline task ini. Client user (RLS), sama dengan /activity (audit B3).
  const { data: activityData } = await (await createClient())
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
      <Link href="/tasks" className="inline-flex min-h-[44px] items-center text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:underline">
        &larr; Kembali ke Tasks
      </Link>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="rounded-md bg-zinc-100 px-2 py-1 font-mono text-sm dark:bg-zinc-800">
          {task.code}
        </span>
        <h1 className="text-2xl font-bold">{task.title}</h1>
        <TaskStatusBadge status={task.status as TaskStatus} />
        <PriorityBadge priority={task.priority} />
        {showsOverdueBadge(task.deadline, task.status, task.completed_at, task.cancelled_at) && <OverdueBadge />}
      </div>

      <div className="mt-4 grid gap-6 lg:grid-cols-2 lg:items-start">
        <section className="rounded-2xl bg-white p-4 shadow-sm sm:p-5 dark:bg-zinc-900">
          <h2 className="mb-2 text-lg font-bold">Detail Task</h2>
          <dl>
            <Row label="Project" value={project ? `${project.code} · ${project.name}` : '-'} />
            <Row label="Workstream" value={workstream ? `${workstream.code} · ${workstream.name}` : '-'} />
            <Row label="Deskripsi" value={task.description || '-'} />
            <Row
              label="Assignee"
              value={assignee ? assignee.full_name || assignee.email : '-'}
            />
            <Row
              label="Dibuat Oleh"
              value={creator ? creator.full_name || creator.email : '-'}
            />
            <Row label="Prioritas" value={task.priority} />
            <Row label="Status" value={taskStatusLabel(task.status)} />
            <Row label="Tanggal Mulai" value={formatDate(task.start_date)} />
            <Row label="Deadline" value={formatDate(task.deadline)} />
            {task.status === 'DONE' && (
              <Row label="Tanggal Submit" value={formatDateTime(task.completed_at)} />
            )}
            {task.status === 'CANCELLED' && (
              <Row label="Tanggal Dibatalkan" value={formatDateTime(task.cancelled_at)} />
            )}
          </dl>

          {sourceBlock && (
            <div className="mt-4 border-t pt-4 dark:border-zinc-700">
              <h3 className="mb-2 text-base font-bold">Sumber</h3>
              {sourceBlock.href ? (
                <Link
                  href={sourceBlock.href}
                  className="text-sm font-medium text-kasuat-deep-gold hover:underline"
                >
                  {sourceBlock.label} — Lihat
                </Link>
              ) : (
                <p className="text-sm text-zinc-600 dark:text-zinc-400">{sourceBlock.label}</p>
              )}
            </div>
          )}

          {canChangeStatus &&
            (task.status === 'DONE' || task.status === 'CANCELLED' ? (
              !canFullEdit && (
                <div className="mt-4 border-t pt-4 dark:border-zinc-700">
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">
                    Task ini terkunci. Minta PM atau Admin untuk mengubahnya.
                  </p>
                </div>
              )
            ) : task.status === 'REVIEW' && !canFullEdit ? (
              <div className="mt-4 border-t pt-4 dark:border-zinc-700">
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  Task ini sudah diserahkan dan menunggu review PM. PM akan menyetujui atau mengembalikannya.
                </p>
              </div>
            ) : (
              <div className="mt-4 border-t pt-4 dark:border-zinc-700">
                <ChangeStatusForm id={task.id} current={task.status as TaskStatus} />
              </div>
            ))}

          <div className="mt-4 border-t pt-4 dark:border-zinc-700">
            <h3 className="mb-2 text-base font-bold">Evidence</h3>
            <EvidenceForm
              id={task.id}
              current={task.evidence_url}
              canSubmit={canSubmitEvidence}
            />
          </div>

          {task.status === 'REVIEW' && canFullEdit && (
            <div className="mt-4 border-t pt-4 dark:border-zinc-700">
              <h3 className="mb-2 text-base font-bold">Review PM</h3>
              <ReviewDecisionForm id={task.id} />
            </div>
          )}

          {canChangeStatus &&
            task.status !== 'DONE' &&
            task.status !== 'CANCELLED' &&
            (task.status !== 'REVIEW' || canCancel) && (
              <div className="mt-4 flex flex-col gap-2 border-t pt-4 sm:flex-row dark:border-zinc-700">
                {task.status !== 'REVIEW' && (
                  <div className="flex-1">
                    <SubmitTaskForm id={task.id} toReview={!canFullEdit} />
                  </div>
                )}
                {canCancel && (
                  <div className="flex-1">
                    <CancelTaskForm id={task.id} />
                  </div>
                )}
              </div>
            )}

          {(openTransfer || canTransfer) && (
            <div className="mt-4 border-t pt-4 dark:border-zinc-700">
              <h3 className="mb-2 text-base font-bold">Alih Task (Backup)</h3>
              {openTransfer ? (
                <TransferCard t={openTransfer} canManage={canFullEdit} userId={profile.id} />
              ) : (
                <details>
                  <summary className="flex min-h-[44px] cursor-pointer items-center text-sm font-semibold">
                    {canFullEdit ? 'Alihkan task ini ke consultant lain' : 'Ajukan alih task (cuti, sakit, berhalangan)'}
                  </summary>
                  <div className="mt-2">
                    <TransferRequestForm
                      tasks={[{ id: task.id, code: task.code, title: task.title }]}
                      users={transferCandidates.filter((u) => u.id !== task.assignee_id)}
                      byManager={canFullEdit}
                      durations={durations}
                    />
                  </div>
                </details>
              )}
            </div>
          )}

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
          <section className="rounded-2xl bg-white p-4 shadow-sm sm:p-5 dark:bg-zinc-900">
            <h2 className="mb-4 text-lg font-bold">Ubah Task</h2>
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
