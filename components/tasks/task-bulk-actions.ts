import 'server-only'
import { hasPermission } from '@/lib/auth/current-access'
import { OPEN_TASK_STATUSES, TASK_PRIORITIES } from '@/lib/auth/roles'
import { getActiveUsers } from '@/lib/data/users'
import { displayName } from '@/lib/data/user-options'
import { bulkCancelTasks, bulkChangeTaskStatus, bulkSetTaskAssignee, bulkSetTaskPriority } from '@/app/actions/tasks'
import type { BulkActionDef } from '@/components/ui/BulkSelect'
import type { UserRole } from '@/types/profile'

/**
 * Aksi massal task untuk /tasks dan tab Tasks di project. Tombol hanya muncul
 * bila user punya izinnya di project mana pun; izin per task dicek ulang di server.
 */
export async function taskBulkActions(userId: string, role: UserRole | string): Promise<BulkActionDef[]> {
  if (role === 'VIEWER') return []
  const [canEdit, canCancel] = await Promise.all([
    hasPermission(userId, 'tasks.edit'),
    hasPermission(userId, 'tasks.cancel'),
  ])
  const actions: BulkActionDef[] = [
    {
      key: 'status',
      label: 'Ubah status',
      run: bulkChangeTaskStatus,
      select: { name: 'status', label: 'Status baru', options: OPEN_TASK_STATUSES.map((s) => ({ value: s, label: s.replace('_', ' ') })) },
    },
  ]
  if (canEdit) {
    const users = await getActiveUsers()
    actions.push(
      {
        key: 'priority',
        label: 'Ubah prioritas',
        run: bulkSetTaskPriority,
        select: { name: 'priority', label: 'Prioritas baru', options: TASK_PRIORITIES.map((p) => ({ value: p, label: p })) },
      },
      {
        key: 'assignee',
        label: 'Ganti assignee',
        run: bulkSetTaskAssignee,
        select: { name: 'assignee_id', label: 'Assignee baru', options: users.map((u) => ({ value: u.id, label: displayName(u) })) },
      }
    )
  }
  if (canCancel) actions.push({ key: 'cancel', label: 'Batalkan task', run: bulkCancelTasks, danger: true })
  return actions
}
