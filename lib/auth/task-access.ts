import type { UserRole } from '@/types/profile'

/**
 * Siapa boleh bertindak atas sebuah task (ubah status, submit, cancel, evidence):
 * ADMIN selalu; PM hanya bila mengelola project task itu; TEAM_MEMBER hanya
 * task miliknya; VIEWER tidak pernah. PM yang menjadi assignee task di project
 * PM lain diperlakukan seperti anggota tim untuk task itu (audit A4, 8 Nov 2026):
 * boleh mengerjakan task-nya sendiri, tetapi tidak boleh edit penuh/hapus.
 */
export function canActOnTask(
  role: UserRole,
  scope: { isAssignee: boolean; managesProject: boolean }
): boolean {
  if (role === 'ADMIN') return true
  if (role === 'PROJECT_MANAGER') return scope.managesProject || scope.isAssignee
  if (role === 'TEAM_MEMBER') return scope.isAssignee
  return false
}
