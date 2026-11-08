import type { UserStatus } from '@/types/profile'

/**
 * Aturan perubahan status user (PRD rule 05, audit A7) sebagai fungsi murni.
 * Dipakai oleh updateUser dan setUserStatus di app/actions/users.ts.
 * Aturan "admin aktif terakhir" (rule 06) ada di removesLastActiveAdmin
 * (lib/auth/project-access.ts) karena butuh hitungan dari database.
 * Mengembalikan pesan error untuk admin, atau null bila boleh.
 */

export const MSG_INVALID_STATUS = 'Pilih status yang valid.'
export const MSG_INVITED_NOT_ACCEPTED = 'User ini belum menerima undangan.'
export const MSG_SELF_STATUS = 'Anda tidak dapat mengubah status Anda sendiri.'
export const MSG_SELF_DEACTIVATE = 'Anda tidak dapat menonaktifkan akun Anda sendiri.'
export const MSG_INVITED_QUICK = 'Status tidak dapat diubah menjadi INVITED di sini.'

type Change = { actorId: string; targetId: string; current: UserStatus; next: UserStatus }

/** Form Edit User (status bisa diubah bersama field lain). */
export function userEditStatusError({ actorId, targetId, current, next }: Change): string | null {
  // Rule 05: admin tidak boleh mengubah status dirinya sendiri (INACTIVE
  // maupun INVITED sama-sama mengunci dia keluar).
  if (targetId === actorId && next !== current) return MSG_SELF_STATUS
  // INVITED hanya hasil kirim undangan; status lain tidak boleh kembali ke sana.
  if (next === 'INVITED' && current !== 'INVITED') return MSG_INVALID_STATUS
  // A7: user INVITED belum punya password; statusnya hanya berubah lewat /accept-invite.
  if (current === 'INVITED' && next !== 'INVITED') return MSG_INVITED_NOT_ACCEPTED
  return null
}

/** Tombol cepat Aktifkan/Nonaktifkan: dicek sebelum status saat ini dibaca. */
export function quickStatusTargetError(next: UserStatus): string | null {
  return next === 'INVITED' ? MSG_INVITED_QUICK : null
}

/** Tombol cepat Aktifkan/Nonaktifkan: dicek sesudah status saat ini dibaca. */
export function quickStatusChangeError({ actorId, targetId, current, next }: Change): string | null {
  if (current === 'INVITED') return MSG_INVITED_NOT_ACCEPTED
  // Rule 05: tidak boleh menonaktifkan diri sendiri.
  if (targetId === actorId && next === 'INACTIVE') return MSG_SELF_DEACTIVATE
  return null
}
