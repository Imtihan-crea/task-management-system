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

/**
 * Siapa boleh membatalkan (Cancel) task: hanya ADMIN, atau PM yang mengelola
 * project task itu. Keputusan pemilik C20 (9 Nov 2026): Team Member dan PM
 * yang hanya menjadi assignee tidak boleh, karena Cancel mengunci task.
 */
export function canCancelTask(role: UserRole, scope: { managesProject: boolean }): boolean {
  if (role === 'ADMIN') return true
  return role === 'PROJECT_MANAGER' && scope.managesProject
}

/**
 * Hasil tombol Submit (review 20 Nov 2026): pengelola project (pemegang
 * tasks.edit) langsung DONE; consultant/assignee lain masuk REVIEW
 * ("Menunggu Review PM") dan PM/Admin yang menyetujui.
 */
export function submitTarget(managesProject: boolean): 'DONE' | 'REVIEW' {
  return managesProject ? 'DONE' : 'REVIEW'
}

/**
 * Ubah status lewat dropdown. REVIEW hanya lewat tombol Submit; yang bukan
 * pengelola project tidak bisa keluar dari REVIEW (PM yang memutuskan).
 * DONE/CANCELLED tidak pernah lewat dropdown.
 */
export function canPickStatus(
  managesProject: boolean,
  from: string,
  to: string
): boolean {
  if (to === 'DONE' || to === 'CANCELLED' || to === 'REVIEW') return from === to
  if (from === 'REVIEW') return managesProject
  return true
}
