'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { isUserRole, isUserStatus } from '@/lib/auth/roles'
import { getAppBaseUrl } from '@/app/actions/invite'
import type { UserRole, UserStatus } from '@/types/profile'

export type UserFormState = {
  error?: string
  success?: string
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
async function emailAlreadyExists(email: string): Promise<boolean> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('profiles')
    .select('id')
    .eq('email', email.toLowerCase())
    .maybeSingle()

  if (error) return false
  return Boolean(data)
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
  await requireAdmin()

  const fullName = readField(formData, 'full_name')
  const email = readField(formData, 'email').toLowerCase()
  const role = readField(formData, 'role')

  if (!fullName) return { error: 'Full name is required.' }
  if (!validEmail(email)) return { error: 'Please enter a valid email address.' }
  if (!isUserRole(role)) return { error: 'Please choose a valid role.' }

  if (await emailAlreadyExists(email)) {
    return { error: 'A user with this email already exists.' }
  }

  const admin = createAdminClient()

  // Password TIDAK pernah kita buat/tahu. Supabase yang mengirim undangan.
  // URL tujuan dibaca dari header request supaya tidak pernah salah jadi localhost.
  const baseUrl = await getAppBaseUrl()
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { full_name: fullName, role },
    redirectTo: `${baseUrl}/accept-invite`,
  })

  // Kalau user sebenarnya sudah dibuat, meski email gagal terkirim
  const findProfileByEmail = async () => {
    const { data: found } = await admin
      .from('profiles')
      .select('id')
      .eq('email', email)
      .maybeSingle<{ id: string }>()
    return found ?? null
  }

  if (error) {
    if (/already|registered|exists/i.test(error.message)) {
      return { error: 'A user with this email already exists.' }
    }

    // Supabase membuat user DULUAN baru mengirim email. Kalau SMTP-nya belum
    // dikonfigurasi, user tetap ada tapi email tidak sampai.
    const alreadyCreated = await findProfileByEmail()
    if (alreadyCreated) {
      await admin
        .from('profiles')
        .update({ full_name: fullName, role, status: 'INVITED' })
        .eq('id', alreadyCreated.id)

      revalidatePath('/users')
      revalidatePath('/dashboard')
      return {
        error:
          'User was created, but the invitation email could not be sent. Set up Supabase SMTP, then send the user a password reset link.',
      }
    }

    // Detail error tidak pernah ditampilkan ke user (PRD section 36)
    console.error('inviteUserByEmail failed:', error.message)
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
  }

  revalidatePath('/users')
  revalidatePath('/dashboard')
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

  return {
    success: status === 'ACTIVE' ? 'User activated successfully.' : 'User deactivated successfully.',
  }
}
