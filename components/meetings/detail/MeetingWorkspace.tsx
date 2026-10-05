import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  fetchMeetingActionItems,
  fetchMeetingAgenda,
  fetchMeetingDecisions,
  fetchMeetingParticipants,
  type MeetingDetail,
} from '@/lib/data/meetings'
import { SyncBadge } from '@/components/meetings/MeetingBadges'
import { LifecycleButtons, MeetingEditForm, NotesForm } from '@/components/meetings/detail/MeetingForms'
import {
  ActionItemCard,
  ActionItemCreateForm,
  AgendaCreateForm,
  AgendaItem,
  DecisionCreateForm,
  DecisionItem,
  ParticipantAddForm,
  ParticipantRow,
  SyncRetryForm,
} from '@/components/meetings/detail/WorkspaceForms'
import {
  ActivityTimeline,
  resolveActorNames,
  type ActivityEntry,
} from '@/components/activity/ActivityTimeline'
import {
  formatDuration,
  formatMeetingDate,
  formatTimeRange,
} from '@/lib/utils/meeting-time'

type UserOption = { id: string; full_name: string | null; email: string }

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 border-b py-2.5 last:border-0 sm:flex-row sm:justify-between sm:gap-4">
      <dt className="text-sm text-zinc-500">{label}</dt>
      <dd className="text-sm font-medium break-all">{value}</dd>
    </div>
  )
}

/* ============================================================================
 * OVERVIEW (§15) — detail + lifecycle + edit + participants
 * ========================================================================== */

export async function OverviewSection({
  meeting,
  project,
  organizerName,
  creatorName,
  users,
  selfId,
  canFull,
  canPickOrganizer,
}: {
  meeting: MeetingDetail
  project: { id: string; code: string; name: string } | null
  organizerName: string
  creatorName: string
  users: UserOption[]
  selfId: string
  canFull: boolean
  canPickOrganizer: boolean
}) {
  const [participants, actions] = await Promise.all([
    fetchMeetingParticipants(meeting.id),
    fetchMeetingActionItems(meeting.id),
  ])

  const editable = canFull && (meeting.status === 'DRAFT' || meeting.status === 'SCHEDULED')
  const tasksCreated = actions.filter((a) => a.task_id).length

  return (
    <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
      <section className="rounded-2xl bg-white p-5 shadow dark:bg-zinc-900">
        <h2 className="mb-2 text-lg font-bold">Meeting Detail</h2>
        <dl>
          <Row label="Project" value={project ? `${project.code} · ${project.name}` : 'Global (tanpa project)'} />
          <Row label="Type" value={meeting.meeting_type.replaceAll('_', ' ')} />
          <Row label="Date" value={formatMeetingDate(meeting.meeting_date)} />
          <Row
            label="Time"
            value={`${formatTimeRange(meeting.start_time, meeting.end_time)} (${formatDuration(meeting.start_time, meeting.end_time)})`}
          />
          <Row label="Location" value={meeting.location || '-'} />
          <Row label="Meeting Link" value={meeting.meeting_link || '-'} />
          <Row label="Description" value={meeting.description || '-'} />
          <Row label="Organizer" value={organizerName} />
          <Row label="Created By" value={creatorName} />
        </dl>

        <div className="mt-4 border-t pt-4 dark:border-zinc-700">
          <h3 className="mb-2 text-base font-bold">Calendar Sync</h3>
          <div className="flex flex-wrap items-center gap-2">
            <SyncBadge status={meeting.google_sync_status} />
            {meeting.google_calendar_event_id && (
              <span className="font-mono text-xs text-zinc-500">{meeting.google_calendar_event_id}</span>
            )}
          </div>
          {meeting.google_sync_status === 'FAILED' && (
            <p className="mt-1 text-sm text-red-600">
              Google Calendar sync failed.
            </p>
          )}
          {canFull && (
            <div className="mt-2">
              <SyncRetryForm meetingId={meeting.id} />
            </div>
          )}
        </div>

        {canFull && (
          <div className="mt-4 border-t pt-4 dark:border-zinc-700">
            <h3 className="mb-2 text-base font-bold">Lifecycle</h3>
            <LifecycleButtons
              meetingId={meeting.id}
              status={meeting.status}
              summary={{
                actionItems: actions.length,
                tasksCreated,
                tasksReady: actions.length - tasksCreated,
              }}
            />
          </div>
        )}
      </section>

      <div className="flex flex-col gap-6">
        <section className="rounded-2xl bg-white p-5 shadow dark:bg-zinc-900">
          <h2 className="mb-2 text-lg font-bold">Participants ({participants.length})</h2>
          {participants.length === 0 ? (
            <p className="text-sm text-zinc-500">No participants yet.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {participants.map((p) => (
                <ParticipantRow
                  key={p.id}
                  meetingId={meeting.id}
                  participant={p}
                  displayName={p.name}
                  canRemove={canFull}
                  isSelf={p.user_id === selfId}
                />
              ))}
            </ul>
          )}
          {canFull && (
            <div className="mt-3">
              <ParticipantAddForm meetingId={meeting.id} users={users} />
            </div>
          )}
        </section>

        {editable && (
          <section className="rounded-2xl bg-white p-5 shadow dark:bg-zinc-900">
            <h2 className="mb-4 text-lg font-bold">Edit Meeting</h2>
            <MeetingEditForm
              meeting={meeting}
              users={users}
              canPickOrganizer={canPickOrganizer}
            />
          </section>
        )}
      </div>
    </div>
  )
}

/* ============================================================================
 * AGENDA (§16)
 * ========================================================================== */

export async function AgendaSection({
  meetingId,
  canContent,
}: {
  meetingId: string
  canContent: boolean
}) {
  const items = await fetchMeetingAgenda(meetingId)
  const ids = items.map((a) => a.id)

  return (
    <section className="rounded-2xl bg-white p-5 shadow dark:bg-zinc-900">
      <h2 className="mb-3 text-lg font-bold">Agenda ({items.length})</h2>
      {items.length === 0 ? (
        <p className="text-sm text-zinc-500">No agenda yet.</p>
      ) : (
        <ol className="flex flex-col gap-2">
          {items.map((a, i) =>
            canContent ? (
              <AgendaItem
                key={a.id}
                meetingId={meetingId}
                agenda={a}
                isFirst={i === 0}
                isLast={i === items.length - 1}
                moveIds={ids}
              />
            ) : (
              <li key={a.id} className="rounded-xl border p-3 dark:border-zinc-700">
                <p className="text-sm font-medium">
                  <span className="mr-2 text-zinc-500">{i + 1}.</span>
                  {a.title}
                </p>
                {a.notes && <p className="mt-1 text-sm text-zinc-500 whitespace-pre-wrap">{a.notes}</p>}
              </li>
            )
          )}
        </ol>
      )}
      {canContent && (
        <div className="mt-3">
          <AgendaCreateForm meetingId={meetingId} />
        </div>
      )}
    </section>
  )
}

/* ============================================================================
 * NOTES (§17)
 * ========================================================================== */

export function NotesSection({
  meetingId,
  notes,
  canContent,
}: {
  meetingId: string
  notes: string
  canContent: boolean
}) {
  return (
    <section className="rounded-2xl bg-white p-5 shadow dark:bg-zinc-900">
      <h2 className="mb-3 text-lg font-bold">Notes</h2>
      {canContent ? (
        <NotesForm meetingId={meetingId} initial={notes} />
      ) : (
        <p className="text-sm whitespace-pre-wrap">{notes || 'No notes yet.'}</p>
      )}
    </section>
  )
}

/* ============================================================================
 * DECISIONS (§18)
 * ========================================================================== */

export async function DecisionsSection({
  meetingId,
  canContent,
}: {
  meetingId: string
  canContent: boolean
}) {
  const items = await fetchMeetingDecisions(meetingId)

  return (
    <section className="rounded-2xl bg-white p-5 shadow dark:bg-zinc-900">
      <h2 className="mb-3 text-lg font-bold">Decisions ({items.length})</h2>
      {items.length === 0 ? (
        <p className="text-sm text-zinc-500">No decisions recorded yet.</p>
      ) : (
        <ol className="flex flex-col gap-2">
          {items.map((d, i) =>
            canContent ? (
              <DecisionItem key={d.id} meetingId={meetingId} decision={d} index={i} />
            ) : (
              <li key={d.id} className="rounded-xl border p-3 dark:border-zinc-700">
                <p className="text-sm font-medium">
                  <span className="mr-2 text-zinc-500">{i + 1}.</span>
                  {d.decision}
                </p>
                {d.rationale && <p className="mt-1 text-sm text-zinc-500">{d.rationale}</p>}
              </li>
            )
          )}
        </ol>
      )}
      {canContent && (
        <div className="mt-3">
          <DecisionCreateForm meetingId={meetingId} />
        </div>
      )}
    </section>
  )
}

/* ============================================================================
 * ACTION ITEMS (§19, §20, §21)
 * ========================================================================== */

export async function ActionsSection({
  meetingId,
  users,
  workstreams,
  canContent,
  canCreateTask,
}: {
  meetingId: string
  users: UserOption[]
  workstreams: { id: string; code: string; name: string }[]
  canContent: boolean
  canCreateTask: boolean
}) {
  const items = await fetchMeetingActionItems(meetingId)

  // Kode task untuk link balik (§21). Satu query untuk semua item.
  const taskIds = [...new Set(items.map((a) => a.task_id).filter((v): v is string => Boolean(v)))]
  let taskCodes: Record<string, string> = {}
  if (taskIds.length > 0) {
    const { data } = await createAdminClient()
      .from('tasks')
      .select('id, code')
      .in('id', taskIds)
    taskCodes = Object.fromEntries(
      ((data ?? []) as { id: string; code: string }[]).map((t) => [t.id, t.code])
    )
  }

  const openCount = items.filter((a) => a.status === 'OPEN' || a.status === 'IN_PROGRESS').length

  return (
    <section className="rounded-2xl bg-white p-5 shadow dark:bg-zinc-900">
      <h2 className="mb-3 text-lg font-bold">
        Action Items ({items.length}
        {openCount > 0 ? ` · ${openCount} open` : ''})
      </h2>
      {items.length === 0 ? (
        <p className="text-sm text-zinc-500">No action items yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((a) =>
            canContent ? (
              <ActionItemCard
                key={a.id}
                meetingId={meetingId}
                item={a}
                users={users}
                workstreams={workstreams}
                canCreateTask={canCreateTask}
                taskCode={a.task_id ? (taskCodes[a.task_id] ?? null) : null}
              />
            ) : (
              <li key={a.id} className="rounded-xl border p-3 dark:border-zinc-700">
                <p className="text-sm font-medium">{a.title}</p>
                {a.description && <p className="mt-1 text-sm text-zinc-500">{a.description}</p>}
                <p className="mt-1 text-xs text-zinc-500">
                  {a.status.replace('_', ' ')}
                  {a.task_id && (
                    <>
                      {' '}· Task:{' '}
                      <Link
                        href={`/tasks/${a.task_id}`}
                        className="font-mono font-semibold text-kasuat-deep-gold hover:underline"
                      >
                        {taskCodes[a.task_id] ?? a.task_id}
                      </Link>
                    </>
                  )}
                </p>
              </li>
            )
          )}
        </ul>
      )}
      {canContent && (
        <div className="mt-3">
          <ActionItemCreateForm meetingId={meetingId} users={users} />
        </div>
      )}
    </section>
  )
}

/* ============================================================================
 * ACTIVITY (§23)
 * ========================================================================== */

export async function MeetingActivitySection({ meetingId }: { meetingId: string }) {
  const { data } = await createAdminClient()
    .from('activity_logs')
    .select('*')
    .eq('entity_type', 'meeting')
    .eq('entity_id', meetingId)
    .order('created_at', { ascending: false })
    .limit(50)

  const entries = (data ?? []) as ActivityEntry[]
  const actorNames = await resolveActorNames(entries)

  return (
    <section className="rounded-2xl bg-white p-5 shadow dark:bg-zinc-900">
      <h2 className="mb-3 text-lg font-bold">Activity</h2>
      {entries.length === 0 ? (
        <p className="text-sm text-zinc-500">No activity yet.</p>
      ) : (
        <ActivityTimeline entries={entries} actorNames={actorNames} />
      )}
    </section>
  )
}
