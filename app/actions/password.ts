'use server'

import { revalidatePath } from 'next/cache'
import { getCurrentProfile } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { logActivity } from '@/lib/activity-log/service'

export type PasswordChangeResult = { error?: string; success?: boolean }

/**
 * Dipanggil SETELAH user berhasil `supabase.auth.updateUser({ password })`
 * di browser (3 Nov 2026).
 *
 * Password-nya sendiri diubah lewat sesi user (bukan service role), jadi
 * admin tidak pernah bisa melihat password baru. Di sini kita hanya
 * membersihkan flag `must_change_password` milik user yang sedang login.
 */
export async function completePasswordChange(): Promise<PasswordChangeResult> {
  const profile = await getCurrentProfile()

  if (!profile) return { error: 'Your session has expired. Please log in again.' }
  if (profile.status !== 'ACTIVE') {
    return { error: 'Your account is inactive. Please contact an administrator.' }
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('profiles')
    .update({ must_change_password: false })
    .eq('id', profile.id)

  if (error) {
    console.error('[change-password] Failed to clear flag:', error.message)
    return { error: 'Password changed, but we could not update your profile. Please try again.' }
  }

  await logActivity({
    actorUserId: profile.id,
    action: 'USER_UPDATED',
    entityType: 'user',
    entityId: profile.id,
    entityCode: profile.email,
    projectId: null,
    metadata: { password_changed: true },
  })

  revalidatePath('/dashboard')
  revalidatePath('/users')

  return { success: true }
}
