'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { isUserRole, isUserStatus } from '@/lib/auth/roles'
import { getAppBaseUrl } from '@/lib/app-url'
import { logActivity } from '@/lib/activity-log/service'
import type { UserRole, UserStatus } from '@/types/profile'

export type UserFormState = {
  error?: string
  success?: string
  /** Link undangan, kalau email tidak bisa dikirim. */
  inviteLink?: string
} | undefined

/* ------------------------------------------------------------------ */
/* Validation helpers (tanpa dependency tambahan)                     */
/* ------------------------------------------------------------------ */

function readField(formData: FormData, name: string): string {
  const value = formData.get(name)
  return typeof value === 'string' ? value.trim() : ''
}

function validEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

/* ------------------------------------------------------------------ */
/* Business rules (PRD section 38)                                    */
/* ------------------------------------------------------------------ */

/** Rule 07: email harus unique. */
async function findProfileByEmail(email: string) {
  const admin = createAdminClient()
  const { data } = await admin
    .from('profiles')
    .select('id')
    .eq('email', email)
    .maybeSingle<{ id: string }>()

  return data ?? null
}

/**
 * Cari user di Supabase Auth berdasarkan email.
 *
 * Penting: user yang DIHAPUS dari tabel `profiles` masih bisa terdaftar
 * di `auth.users`. Kalau kita hanya cek `profiles`, invite ulang akan
 * ditolak Supabase tanpa pesan yang jelas.
 */
async function findAuthUserByEmail(email: string) {
  const admin = createAdminClient()

  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 100 })
    if (error) return null

    const found = data.users.find(
      (candidate) => candidate.email?.toLowerCase() === email
    )
    if (found) return found

    if (data.users.length < 100) return null
  }

  return null
}

/**
 * Rule 06: harus selalu ada minimal satu active Admin.
 * Dijuga di layer database, ini lapisan kedua yang ramah user.
 */
async function wouldRemoveLastAdmin(targetId: string, nextRole: UserRole, nextStatus: UserStatus) {
  const admin = createAdminClient()

  const { data: target } = await admin
    .from('profiles')
    .select('role, status')
    .eq('id', targetId)
    .single<{ role: UserRole; status: UserStatus }>()

  if (!target) return false

  // Hanya relevan kalau target sebelumnya Admin aktif
  if (target.role !== 'ADMIN' || target.status !== 'ACTIVE') return false

  const stillActiveAdmin = nextRole === 'ADMIN' && nextStatus === 'ACTIVE'
  if (stillActiveAdmin) return false

  const { count } = await admin
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('role', 'ADMIN')
    .eq('status', 'ACTIVE')
    .neq('id', targetId)

  return (count ?? 0) === 0
}

/* ------------------------------------------------------------------ */
/* 13 - Invite User                                                    */
/* ------------------------------------------------------------------ */

export async function inviteUser(
  _prev: UserFormState,
  formData: FormData
): Promise<UserFormState> {
  const actor = await requireAdmin()

  const fullName = readField(formData, 'full_name')
  const email = readField(formData, 'email').toLowerCase()
  const role = readField(formData, 'role')

  if (!fullName) return { error: 'Full name is required.' }
  if (!validEmail(email)) return { error: 'Please enter a valid email address.' }
  if (!isUserRole(role)) return { error: 'Please choose a valid role.' }

  const admin = createAdminClient()

  // Cek di profiles
  if (await findProfileByEmail(email)) {
    return { error: 'A user with this email already exists.' }
  }

  // Cek juga di Supabase Auth. Menghapus baris di tabel `profiles`
  // TIDAK menghapus user dari Supabase Auth.
  const existingAuthUser = await findAuthUserByEmail(email)
  if (existingAuthUser) {
    return {
      error:
        'This email is still registered in Supabase Auth. Delete the user in Supabase Dashboard > Authentication > Users first, then invite again.',
    }
  }

  // Password TIDAK pernah kita buat/tahu. Supabase yang mengirim undangan.
  // URL tujuan SELALU dari APP_URL, tidak dari host request, supaya link
  // invitation tidak pernah mengarah ke domain preview / localhost.
  let baseUrl: string
  try {
    baseUrl = getAppBaseUrl()
  } catch (configError) {
    console.error('APP_URL missing:', (configError as Error).message)
    return {
      error:
        'Server is not configured for invitations. Ask your developer to set APP_URL in the deployment platform.',
    }
  }

  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { full_name: fullName, role },
    redirectTo: `${baseUrl}/accept-invite`,
  })

  /**
   * Fallback saat email tidak bisa dikirim.
   *
   * Plan gratis Supabase hanya mengizinkan 2 email per jam, dan hanya ke
   * anggota tim project. Daripada membuat user bergantung pada email yang
   * tidak sampai, kita buat user-nya lalu berikan link untuk dikirim
   * sendiri (WhatsApp, email, atau apa pun).
   *
   * `generateLink` tidak memakai kuota email, jadi selalu berhasil.
   */
  async function createUserWithoutEmail(): Promise<string | null> {
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      email_confirm: false,
      user_metadata: { full_name: fullName, role },
    })

    if (createError || !created?.user) {
      console.error('[invite] createUser failed:', createError?.message)
      return null
    }

    const userId = created.user.id

    await logActivity({
      actorUserId: actor.id,
      action: 'USER_CREATED',
      entityType: 'user',
      entityId: userId,
      entityCode: email,
      projectId: null,
      metadata: { email, full_name: fullName, role, via: 'fallback-link' },
    });
    const { data: updated } = await admin
      .from('profiles')
      .update({ full_name: fullName, role, status: 'INVITED' })
      .eq('id', userId)
      .select('id')

    if (!updated || updated.length === 0) {
      await admin.from('profiles').insert({
        id: userId,
        email,
        full_name: fullName,
        role,
        status: 'INVITED',
      })
    }

    const { data: linkData } = await admin.auth.admin.generateLink({
      type: 'invite',
      email,
      options: { redirectTo: `${baseUrl}/accept-invite` },
    })

    const actionLink = linkData?.properties?.action_link
    if (!actionLink) return null

    // Link Supabase biasanya lewat server verify-nya sendiri
    // (verify?token=...&redirect_to=...). Kita ambil tokennya lalu arahkan
    // LANGSUNG ke /accept-invite, supaya tidak bergantung Redirect URL.
    const token = new URL(actionLink).searchParams.get('token')
    if (!token) return null

    return `${baseUrl}/accept-invite#token_hash=${token}&type=invite`
  }

  if (error) {
    if (/already|registered|exists/i.test(error.message)) {
      return { error: 'A user with this email already exists.' }
    }

    // Detail teknis tetap dicatat di server log untuk diagnosa.
    console.error('[invite] Supabase error:', error.message)

    const isRateLimit = /rate limit|quota|too many|security purposes/i.test(
      error.message
    )
    const isEmailProblem = /smtp|mail/i.test(error.message)

    if (isRateLimit || isEmailProblem) {
      const directLink = await createUserWithoutEmail()

      if (directLink) {
        revalidatePath('/users')
        revalidatePath('/dashboard')
        return {
          success:
            'User created, but Supabase could not send the email (email limit). Send the invitation link below.',
          inviteLink: directLink,
        }
      }

      return {
        error:
          'User created, but the invitation link could not be generated. Ask your developer to check the Vercel logs.',
      }
    }

    // Supabase menolak URL tujuan kalau domainnya tidak terdaftar di
    // Authentication > URL Configuration > Redirect URLs.
    if (/redirect|not allowed|invalid.*url|uri/i.test(error.message)) {
      return {
        error:
          'Supabase rejected the application URL. Ask your developer to check the APP_URL and Supabase Redirect URLs settings.',
      }
    }

    return { error: 'Unable to invite user. Please try again.' }
  }

  const userId = data.user?.id

  // Jaga konsistensi: Auth User HARUS punya Profile (PRD section 29)
  if (userId) {
    const { data: updated } = await admin
      .from('profiles')
      .update({ full_name: fullName, role, status: 'INVITED' })
      .eq('id', userId)
      .select('id')

    if (!updated || updated.length === 0) {
      await admin.from('profiles').insert({
        id: userId,
        email,
        full_name: fullName,
        role,
        status: 'INVITED',
      })
    }

    await logActivity({
      actorUserId: actor.id,
      action: 'USER_CREATED',
      entityType: 'user',
      entityId: userId,
      entityCode: email,
      projectId: null,
      metadata: { email, full_name: fullName, role, via: 'fallback-link' },
    })
  }

  revalidatePath('/users')
  revalidatePath('/dashboard')

  if (userId) {
    await logActivity({
      actorUserId: actor.id,
      action: 'USER_CREATED',
      entityType: 'user',
      entityId: userId,
      entityCode: email,
      projectId: null,
      metadata: { email, full_name: fullName, role },
    })
  }

  return { success: 'Invitation sent successfully.' }
}

/* ------------------------------------------------------------------ */
/* 18 - Edit User (Full Name + Role + Status)                          */
/* ------------------------------------------------------------------ */

export async function updateUser(
  _prev: UserFormState,
  formData: FormData
): Promise<UserFormState> {
  const adminProfile = await requireAdmin()

  const targetId = readField(formData, 'id')
  const fullName = readField(formData, 'full_name')
  const role = readField(formData, 'role')
  const status = readField(formData, 'status')

  if (!targetId) return { error: 'User not found.' }
  if (!fullName) return { error: 'Full name is required.' }
  if (!isUserRole(role)) return { error: 'Please choose a valid role.' }
  if (!isUserStatus(status)) return { error: 'Please choose a valid status.' }

  const { data: current, error: readError } = await createAdminClient()
    .from('profiles')
    .select('role, status')
    .eq('id', targetId)
    .single<{ role: UserRole; status: UserStatus }>()

  if (readError || !current) return { error: 'User not found.' }

  // Rule 05: user tidak boleh menonaktifkan dirinya sendiri
  if (targetId === adminProfile.id && current.status === 'ACTIVE' && status === 'INACTIVE') {
    return { error: 'You cannot deactivate your own account.' }
  }

  // Rule 06: sisakan minimal satu active Admin
  if (await wouldRemoveLastAdmin(targetId, role, status)) {
    return { error: 'At least one active administrator must remain.' }
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('profiles')
    .update({ full_name: fullName, role, status })
    .eq('id', targetId)

  if (error) {
    console.error('updateUser failed:', error.message)
    return { error: 'Unable to update user.' }
  }

  revalidatePath('/users')
  revalidatePath(`/users/${targetId}`)
  revalidatePath('/dashboard')

  const roleChanged = current.role !== role
  const statusChanged = current.status !== status

  await logActivity({
    actorUserId: adminProfile.id,
    action: 'USER_UPDATED',
    entityType: 'user',
    entityId: targetId,
    entityCode: '',
    projectId: null,
    metadata: { full_name: fullName },
  })
  if (roleChanged) {
    await logActivity({
      actorUserId: adminProfile.id,
      action: 'ROLE_CHANGED',
      entityType: 'user',
      entityId: targetId,
      entityCode: '',
      projectId: null,
      metadata: { old_role: current.role, new_role: role },
    })
  }
  if (statusChanged) {
    await logActivity({
      actorUserId: adminProfile.id,
      action: status === 'ACTIVE' ? 'USER_ACTIVATED' : 'USER_DEACTIVATED',
      entityType: 'user',
      entityId: targetId,
      entityCode: '',
      projectId: null,
      metadata: { old_status: current.status, new_status: status },
    })
  }

  return {
    success: roleChanged
      ? 'User role updated successfully.'
      : 'User updated successfully.',
  }
}

/* ------------------------------------------------------------------ */
/* 20 & 21 - Activate / Deactivate (tombol cepat di list & detail)     */
/* ------------------------------------------------------------------ */

export async function setUserStatus(
  _prev: UserFormState,
  formData: FormData
): Promise<UserFormState> {
  const adminProfile = await requireAdmin()

  const targetId = readField(formData, 'id')
  const status = readField(formData, 'status')

  if (!targetId) return { error: 'User not found.' }
  if (!isUserStatus(status)) return { error: 'Please choose a valid status.' }
  if (status === 'INVITED') return { error: 'Status cannot be set to INVITED here.' }

  const admin = createAdminClient()

  const { data: current, error: readError } = await admin
    .from('profiles')
    .select('role, status')
    .eq('id', targetId)
    .single<{ role: UserRole; status: UserStatus }>()

  if (readError || !current) return { error: 'User not found.' }

  // Rule 05: self-deactivation
  if (targetId === adminProfile.id && status === 'INACTIVE') {
    return { error: 'You cannot deactivate your own account.' }
  }

  // Rule 06: last active admin
  if (await wouldRemoveLastAdmin(targetId, current.role, status)) {
    return { error: 'At least one active administrator must remain.' }
  }

  const { error } = await admin.from('profiles').update({ status }).eq('id', targetId)

  if (error) {
    console.error('setUserStatus failed:', error.message)
    return { error: 'Unable to update user.' }
  }

  revalidatePath('/users')
  revalidatePath(`/users/${targetId}`)
  revalidatePath('/dashboard')

  await logActivity({
    actorUserId: adminProfile.id,
    action: status === 'ACTIVE' ? 'USER_ACTIVATED' : 'USER_DEACTIVATED',
    entityType: 'user',
    entityId: targetId,
    entityCode: '',
    projectId: null,
    metadata: { old_status: current.status, new_status: status },
  })

  return {
    success: status === 'ACTIVE' ? 'User activated successfully.' : 'User deactivated successfully.',
  }
}
