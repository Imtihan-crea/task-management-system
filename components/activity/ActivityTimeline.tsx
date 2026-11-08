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
      return `Status diubah ${str(m.old_status).replace('_', ' ')} → ${str(m.new_status).replace('_', ' ')}`
    case 'TASK_ASSIGNED':
      return 'Task ditugaskan'
    case 'TASK_PRIORITY_CHANGED':
      return `Prioritas diubah ${str(m.old_priority)} → ${str(m.new_priority)}`
    case 'TASK_DEADLINE_CHANGED':
      return `Deadline diubah ${str(m.old_deadline)} → ${str(m.new_deadline)}`
    case 'TASK_EVIDENCE_UPDATED':
      return 'Evidence diperbarui'
    case 'TASK_CREATED':
      return 'Task dibuat'
    case 'TASK_UPDATED':
      return 'Task diperbarui'
    case 'TASK_DELETED':
      return 'Task dihapus'
    case 'PROJECT_CREATED':
      return 'Project dibuat'
    case 'PROJECT_UPDATED':
      return 'Project diperbarui'
    case 'PROJECT_PM_ADDED':
      return 'Project Manager ditambahkan'
    case 'PROJECT_PM_REMOVED':
      return 'Project Manager dihapus'
    case 'WORKSTREAM_CREATED':
      return 'Workstream dibuat'
    case 'WORKSTREAM_UPDATED':
      return 'Workstream diperbarui'
    case 'WORKSTREAM_DELETED':
      return 'Workstream dihapus'
    case 'SUGGESTION_CREATED':
      return 'Suggestion dikirim'
    case 'SUGGESTION_UPDATED':
      return 'Suggestion diperbarui'
    case 'SUGGESTION_APPROVED':
      return 'Suggestion disetujui'
    case 'SUGGESTION_REVISION_REQUESTED':
      return 'Revisi diminta'
    case 'SUGGESTION_REJECTED':
      return 'Suggestion ditolak'
    case 'SUGGESTION_CONVERTED':
      return `Dikonversi menjadi task ${str(m.converted_task_code)}`
    case 'USER_CREATED':
      return `User diundang (${str(m.email)})`
    case 'USER_UPDATED':
      return 'User diperbarui'
    case 'USER_ACTIVATED':
      return 'User diaktifkan'
    case 'USER_DEACTIVATED':
      return 'User dinonaktifkan'
    case 'ROLE_CHANGED':
      return `Role diubah ${str(m.old_role)} → ${str(m.new_role)}`
    default:
      return entry.action.replace(/_/g, ' ')
  }
}

export function ActivityTimeline({
  entries,
  actorNames,
  emptyText = 'Belum ada Activity.',
}: {
  entries: ActivityEntry[]
  actorNames: Record<string, string>
  emptyText?: string
}) {
  if (entries.length === 0) {
    return <p className="text-sm text-zinc-600 dark:text-zinc-400">{emptyText}</p>
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
            <p className="break-words text-sm font-semibold text-[#221F1F] dark:text-zinc-100">
              {describeActivity(entry)}
            </p>
            <p className="truncate text-sm text-zinc-600 dark:text-zinc-400">
              {entry.actor_user_id
                ? (actorNames[entry.actor_user_id] ?? 'User tidak dikenal')
                : 'Sistem'}
              {entry.entity_code ? ` · ${entry.entity_code}` : ''}
            </p>
            <p className="text-xs text-zinc-600 dark:text-zinc-400">{formatDate(entry.created_at)}</p>
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
