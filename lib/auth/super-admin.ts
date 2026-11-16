import type { UserRole, UserStatus } from '@/types/profile'

/**
 * Aturan Super Admin (16 Nov 2026) sebagai fungsi murni; dipakai app/actions/users.ts.
 * Super Admin = ADMIN dengan profiles.is_super_admin (migrasi 018).
 * Mengembalikan pesan error untuk admin, atau null bila boleh.
 */

export const MSG_SUPER_ONLY_ADMIN = 'Hanya Super Admin yang bisa mengubah akun Admin lain.'
export const MSG_SUPER_ONLY_PROMOTE = 'Hanya Super Admin yang bisa menjadikan user Admin.'
export const MSG_SUPER_LOCKED = 'Super Admin tidak bisa diturunkan atau dinonaktifkan.'

type Target = { id: string; role: UserRole; isSuper: boolean }
type Next = { role?: UserRole; status?: UserStatus }

export function superAdminError(
  actor: { id: string; isSuper: boolean },
  target: Target,
  next: Next = {}
): string | null {
  if (target.isSuper && ((next.role && next.role !== 'ADMIN') || (next.status && next.status !== 'ACTIVE'))) {
    return MSG_SUPER_LOCKED
  }
  if (actor.isSuper) return null
  if ((target.role === 'ADMIN' || target.isSuper) && target.id !== actor.id) return MSG_SUPER_ONLY_ADMIN
  if (next.role === 'ADMIN' && target.role !== 'ADMIN') return MSG_SUPER_ONLY_PROMOTE
  return null
}

export const MSG_ROLE_NEEDS_CHANGE_ROLE = 'Tanpa izin ubah role, user baru hanya bisa Team Member atau Viewer.'

/**
 * User baru (undang / buat dengan password): ADMIN hanya oleh Super Admin;
 * PM hanya oleh pemegang users.changeRole (tanpa itu, users.invite bisa dipakai
 * membuat akun PM sendiri = naik peran lewat jalan samping; review 16 Nov 2026).
 */
export function newUserRoleError(actorIsSuper: boolean, role: UserRole, canChangeRole: boolean): string | null {
  if (role === 'ADMIN' && !actorIsSuper) return MSG_SUPER_ONLY_PROMOTE
  if (role !== 'TEAM_MEMBER' && role !== 'VIEWER' && !canChangeRole) return MSG_ROLE_NEEDS_CHANGE_ROLE
  return null
}
