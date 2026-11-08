'use server'

import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { getCurrentProfile } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { logActivity } from '@/lib/activity-log/service'
import { friendlyPasswordError, validateSelfPassword } from '@/lib/auth/password'

/**
 * `passwordSaved` + `error`: password sudah diganti tetapi flag belum bersih.
 * Sesi lama sudah dicabut, jadi klien harus mengarahkan ke /login (bukan retry).
 */
export type PasswordChangeResult = { error?: string; success?: boolean; passwordSaved?: boolean }

const SESSION_EXPIRED = 'Sesi Anda telah berakhir. Silakan Login kembali.'

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
 * Satu-satunya jalan mengganti password sendiri (audit A3, 9 Nov 2026).
 *
 * Dulu browser memanggil `auth.updateUser` lalu action yang hanya menghapus
 * flag `must_change_password`; action itu bisa dipanggil langsung tanpa
 * mengganti password. Sekarang password diset di server (service role) dan
 * flag dibersihkan hanya setelah penggantian berhasil. Password tidak pernah
 * dicatat ke log.
 */
export async function setOwnPassword(
  password: string,
  accessToken?: string
): Promise<PasswordChangeResult> {
  const fieldError = validateSelfPassword(password, password)
  if (fieldError) return { error: fieldError }

  const profile = await resolveActor(accessToken)

  if (!profile) return { error: SESSION_EXPIRED }
  if (profile.status !== 'ACTIVE') {
    return { error: 'Akun Anda nonaktif. Silakan hubungi administrator.' }
  }

  // updateUserById menerima password yang sama dengan sekarang; tolak di sini
  // supaya password sementara dari admin tidak bisa "diganti" dengan dirinya sendiri.
  const probe = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
  )
  const { error: sameError } = await probe.auth.signInWithPassword({
    email: profile.email,
    password,
  })
  if (!sameError) return { error: 'Password baru harus berbeda dari password saat ini.' }

  const admin = createAdminClient()
  const { error: authError } = await admin.auth.admin.updateUserById(profile.id, {
    password,
  })
  if (authError) {
    console.error('[change-password] updateUserById failed:', authError.message)
    return { error: friendlyPasswordError(authError.message, SESSION_EXPIRED) }
  }

  const { error } = await admin
    .from('profiles')
    .update({ must_change_password: false })
    .eq('id', profile.id)

  // Kolom belum ada (migrasi 011 belum jalan) — tidak ada flag yang perlu
  // dibersihkan, jadi password tetap dianggap berhasil diubah.
  if (error?.code === '42703') {
    console.warn(
      '[schema] profiles.must_change_password belum ada. Jalankan database/migrations/011_must_change_password.sql.'
    )
  } else if (error) {
    console.error('[change-password] Failed to clear flag:', error.message)
    return {
      passwordSaved: true,
      error: 'Password sudah diubah, tetapi profil Anda belum dapat diperbarui. Masuk dengan password baru.',
    }
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

  // Tanpa revalidatePath: sesi lama sudah dicabut, jadi refresh halaman oleh
  // action akan melempar ke /login sebelum klien sempat masuk lagi.

  return { success: true }
}
