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

/** User baru (undang / buat dengan password): role ADMIN hanya oleh Super Admin. */
export function newUserRoleError(actorIsSuper: boolean, role: UserRole): string | null {
  return role === 'ADMIN' && !actorIsSuper ? MSG_SUPER_ONLY_PROMOTE : null
}
