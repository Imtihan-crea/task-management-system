'use server'

import { revalidatePath } from 'next/cache'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { getCurrentProfile } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { logActivity } from '@/lib/activity-log/service'

export type PasswordChangeResult = { error?: string; success?: boolean }

type ActorProfile = { id: string; email: string; status: string }

/**
 * Cari profil user yang password-nya baru diubah.
 *
 * Normalnya cukup dari cookie session (`getCurrentProfile`). Tapi sesi hasil
 * link recovery (`/reset-password`) kadang tidak sampai ke server (atau
 * refresh token-nya sudah dirotasi), jadi client boleh mengirim access token
 * hasil `supabase.auth.updateUser` sebagai jalur cadangan. Token itu
 * diverifikasi ke Supabase — bukan dipercaya begitu saja.
 */
async function resolveActor(accessToken?: string): Promise<ActorProfile | null> {
  if (accessToken) {
    const client = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: { headers: { Authorization: `Bearer ${accessToken}` } },
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      }
    )

    const { data, error } = await client.auth.getUser()
    if (error || !data.user) return null

    const admin = createAdminClient()
    const { data: profile } = await admin
      .from('profiles')
      .select('id, email, status')
      .eq('id', data.user.id)
      .single<ActorProfile>()

    return profile ?? null
  }

  const current = await getCurrentProfile()
  if (!current) return null

  return { id: current.id, email: current.email, status: current.status }
}

/**
 * Dipanggil SETELAH user berhasil `supabase.auth.updateUser({ password })`
 * di browser (3 Nov 2026, diperluas 5 Nov 2026 untuk link recovery).
 *
 * Password-nya sendiri diubah lewat sesi user (bukan service role), jadi
 * admin tidak pernah bisa melihat password baru. Di sini kita hanya
 * membersihkan flag `must_change_password` milik user tersebut.
 */
export async function completePasswordChange(
  accessToken?: string
): Promise<PasswordChangeResult> {
  const profile = await resolveActor(accessToken)

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
