import type { UserRole, UserStatus } from '@/types/profile'

/**
 * Aturan izin berbasis project, murni (tanpa I/O) supaya bisa dites.
 * Query database (apakah user PM project X, dst.) dikerjakan pemanggil.
 */

/** Kelola project/task/workstream/review suggestion: ADMIN, atau PM project itu. */
export function canManageProject(role: UserRole | string, managesProject: boolean): boolean {
  if (role === 'ADMIN') return true
  return role === 'PROJECT_MANAGER' && managesProject
}

/** Usul task: ADMIN; PM bila mengelola project; selain itu bila punya task di project. */
export function canSuggestForProject(
  role: UserRole | string,
  scope: { managesProject: boolean; hasAssignedTask: boolean }
): boolean {
  if (role === 'ADMIN') return true
  if (role === 'PROJECT_MANAGER') return scope.managesProject
  return scope.hasAssignedTask
}

/** Rule 06: perubahan ini menghapus Admin aktif terakhir? (harus ditolak) */
export function removesLastActiveAdmin(input: {
  current: { role: UserRole; status: UserStatus }
  next: { role: UserRole; status: UserStatus }
  otherActiveAdmins: number
}): boolean {
  const wasActiveAdmin = input.current.role === 'ADMIN' && input.current.status === 'ACTIVE'
  const staysActiveAdmin = input.next.role === 'ADMIN' && input.next.status === 'ACTIVE'
  return wasActiveAdmin && !staysActiveAdmin && input.otherActiveAdmins === 0
}
