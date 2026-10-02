import { createAdminClient } from '@/lib/supabase/admin'
import { formatDate } from '@/lib/utils/dates'

export type ActivityEntry = {
  id: string
  actor_user_id: string | null
  actor_type: string
  action: string
  entity_type: string
  entity_id: string
  entity_code: string
  project_id: string | null
  metadata: Record<string, unknown>
  created_at: string
}

/** Kalimat human-readable per action + metadata. */
export function describeActivity(entry: Pick<ActivityEntry, 'action' | 'metadata'>): string {
  const m = entry.metadata ?? {}
  const str = (v: unknown) => (typeof v === 'string' ? v : '')

  switch (entry.action) {
    case 'TASK_STATUS_CHANGED':
      return `Status changed ${str(m.old_status).replace('_', ' ')} → ${str(m.new_status).replace('_', ' ')}`
    case 'TASK_ASSIGNED':
      return 'Task assigned'
    case 'TASK_PRIORITY_CHANGED':
      return `Priority changed ${str(m.old_priority)} → ${str(m.new_priority)}`
    case 'TASK_DEADLINE_CHANGED':
      return `Deadline changed ${str(m.old_deadline)} → ${str(m.new_deadline)}`
    case 'TASK_EVIDENCE_UPDATED':
      return 'Evidence updated'
    case 'TASK_CREATED':
      return 'Task created'
    case 'TASK_UPDATED':
      return 'Task updated'
    case 'TASK_DELETED':
      return 'Task deleted'
    case 'PROJECT_CREATED':
      return 'Project created'
    case 'PROJECT_UPDATED':
      return 'Project updated'
    case 'PROJECT_PM_ADDED':
      return 'Project manager added'
    case 'PROJECT_PM_REMOVED':
      return 'Project manager removed'
    case 'WORKSTREAM_CREATED':
      return 'Workstream created'
    case 'WORKSTREAM_UPDATED':
      return 'Workstream updated'
    case 'WORKSTREAM_DELETED':
      return 'Workstream deleted'
    case 'SUGGESTION_CREATED':
      return 'Suggestion submitted'
    case 'SUGGESTION_UPDATED':
      return 'Suggestion updated'
    case 'SUGGESTION_APPROVED':
      return 'Suggestion approved'
    case 'SUGGESTION_REVISION_REQUESTED':
      return 'Revision requested'
    case 'SUGGESTION_REJECTED':
      return 'Suggestion rejected'
    case 'SUGGESTION_CONVERTED':
      return `Converted to task ${str(m.converted_task_code)}`
    case 'USER_CREATED':
      return `User invited (${str(m.email)})`
    case 'USER_UPDATED':
      return 'User updated'
    case 'USER_ACTIVATED':
      return 'User activated'
    case 'USER_DEACTIVATED':
      return 'User deactivated'
    case 'ROLE_CHANGED':
      return `Role changed ${str(m.old_role)} → ${str(m.new_role)}`
    default:
      return entry.action.replace(/_/g, ' ')
  }
}

export function ActivityTimeline({
  entries,
  actorNames,
  emptyText = 'No activity yet.',
}: {
  entries: ActivityEntry[]
  actorNames: Record<string, string>
  emptyText?: string
}) {
  if (entries.length === 0) {
    return <p className="text-sm text-zinc-500">{emptyText}</p>
  }

  return (
    <ol className="flex flex-col gap-4">
      {entries.map((entry) => (
        <li key={entry.id} className="flex gap-3">
          <span
            aria-hidden="true"
            className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-[#BE9B5C]"
          />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[#221F1F] dark:text-zinc-100">
              {describeActivity(entry)}
            </p>
            <p className="truncate text-sm text-zinc-500">
              {entry.actor_user_id
                ? (actorNames[entry.actor_user_id] ?? 'Unknown user')
                : 'System'}
              {entry.entity_code ? ` · ${entry.entity_code}` : ''}
            </p>
            <p className="text-xs text-[#A6A6A6]">{formatDate(entry.created_at)}</p>
          </div>
        </li>
      ))}
    </ol>
  )
}

/** Ambil nama actor untuk sekumpulan entries (satu query). */
export async function resolveActorNames(
  entries: { actor_user_id: string | null }[]
): Promise<Record<string, string>> {
  const ids = [...new Set(entries.map((e) => e.actor_user_id).filter(Boolean))] as string[]
  if (ids.length === 0) return {}

  const { data } = await createAdminClient()
    .from('profiles')
    .select('id, full_name, email')
    .in('id', ids)

  return Object.fromEntries(
    ((data ?? []) as { id: string; full_name: string | null; email: string }[]).map((u) => [
      u.id,
      u.full_name || u.email,
    ])
  )
}
