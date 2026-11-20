import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { permissionProjects } from '@/lib/auth/current-access'
import { getActiveUsers } from '@/lib/data/users'
import { displayName } from '@/lib/data/user-options'
import { TRANSFER_COLUMNS, type TransferRow } from '@/lib/tasks/transfers'
import { OPEN_TRANSFER_STATUSES, durationOptions } from '@/lib/tasks/transfer-rules'
import { loadReferences } from '@/lib/hr/data'

export type TransferView = TransferRow & {
  task: { id: string; code: string; title: string; project_id: string; status: string } | null
  fromName: string
  toName: string
  requesterName: string
  decision_note: string | null
  note: string | null
  created_at: string
}

/** Pilihan durasi alih task dari Master Reference (yang aktif dan terbaca). */
export async function transferDurations(): Promise<{ label: string; minutes: number }[]> {
  return durationOptions((await loadReferences(['TRANSFER_DURATION'])).filter((r) => !r.archived_at).map((r) => r.label))
}

/** Calon pengganti: user aktif selain VIEWER. */
export async function transferUsers(): Promise<{ id: string; name: string }[]> {
  return (await getActiveUsers(['ADMIN', 'PROJECT_MANAGER', 'TEAM_MEMBER'])).map((u) => ({ id: u.id, name: displayName(u) }))
}

async function withNames(rows: (TransferRow & { decision_note: string | null; note: string | null; created_at: string })[]): Promise<TransferView[]> {
  if (rows.length === 0) return []
  const admin = createAdminClient()
  const userIds = [...new Set(rows.flatMap((r) => [r.from_user_id, r.to_user_id, r.requested_by].filter((v): v is string => Boolean(v))))]
  const taskIds = [...new Set(rows.map((r) => r.task_id))]
  const [{ data: people }, { data: tasks }] = await Promise.all([
    admin.from('profiles').select('id, full_name, email').in('id', userIds),
    admin.from('tasks').select('id, code, title, project_id, status').in('id', taskIds),
  ])
  const name = new Map(((people ?? []) as { id: string; full_name: string | null; email: string }[]).map((p) => [p.id, p.full_name || p.email]))
  const task = new Map(((tasks ?? []) as NonNullable<TransferView['task']>[]).map((t) => [t.id, t]))
  return rows.map((r) => ({
    ...r,
    task: task.get(r.task_id) ?? null,
    fromName: name.get(r.from_user_id) ?? '-',
    toName: name.get(r.to_user_id) ?? '-',
    requesterName: r.requested_by ? (name.get(r.requested_by) ?? '-') : '-',
  }))
}

const COLUMNS = `${TRANSFER_COLUMNS}, decision_note, note, created_at`

/** Alih task yang masih berjalan untuk satu task (paling banyak satu). */
export async function openTransferForTask(taskId: string): Promise<TransferView | null> {
  const { data } = await createAdminClient()
    .from('task_transfers')
    .select(COLUMNS)
    .eq('task_id', taskId)
    .in('status', OPEN_TRANSFER_STATUSES)
    .limit(1)
  return (await withNames((data ?? []) as unknown as Parameters<typeof withNames>[0]))[0] ?? null
}

/**
 * Halaman /tasks/alih: `manage` = alih task di project yang ia kelola
 * (pemegang tasks.edit); `mine` = yang melibatkan dirinya; riwayat 50 terakhir.
 */
export async function transferLists(userId: string): Promise<{ manage: TransferView[]; mine: TransferView[]; history: TransferView[] }> {
  const admin = createAdminClient()
  const scope = await permissionProjects(userId, 'tasks.edit')
  const [{ data: open }, { data: past }] = await Promise.all([
    admin.from('task_transfers').select(COLUMNS).in('status', OPEN_TRANSFER_STATUSES).order('created_at', { ascending: false }).limit(500),
    admin.from('task_transfers').select(COLUMNS).not('status', 'in', `(${OPEN_TRANSFER_STATUSES.join(',')})`).order('updated_at', { ascending: false }).limit(200),
  ])
  const openRows = await withNames((open ?? []) as unknown as Parameters<typeof withNames>[0])
  const pastRows = await withNames((past ?? []) as unknown as Parameters<typeof withNames>[0])
  const canManage = (r: TransferView) =>
    Boolean(r.task) && (scope.all ? !scope.exclude.includes(r.task!.project_id) : scope.include.includes(r.task!.project_id))
  const involves = (r: TransferView) => r.from_user_id === userId || r.to_user_id === userId || r.requested_by === userId
  return {
    manage: openRows.filter(canManage),
    mine: openRows.filter((r) => involves(r) && !canManage(r)),
    history: pastRows.filter((r) => canManage(r) || involves(r)).slice(0, 50),
  }
}
