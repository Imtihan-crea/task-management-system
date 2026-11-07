import type { UserRole } from '@/types/profile'

/**
 * Siapa boleh bertindak atas sebuah task (ubah status, submit, cancel, evidence):
 * ADMIN selalu; PM hanya bila mengelola project task itu; TEAM_MEMBER hanya
 * task miliknya; VIEWER tidak pernah. PM yang kebetulan assignee tetapi bukan
 * PM project-nya tetap ditolak (aturan lama, dipertahankan).
 */
export function canActOnTask(
  role: UserRole,
  scope: { isAssignee: boolean; managesProject: boolean }
): boolean {
  if (role === 'ADMIN') return true
  if (role === 'PROJECT_MANAGER') return scope.managesProject
  if (role === 'TEAM_MEMBER') return scope.isAssignee
  return false
}
