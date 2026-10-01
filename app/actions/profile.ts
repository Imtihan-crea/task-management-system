'use server'

import { revalidatePath } from 'next/cache'
import { requireProfile } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'

export type ProfileFormState = {
  error?: string
  success?: string
} | undefined

/**
 * User hanya boleh mengubah Full Name miliknya sendiri.
 *
 * Keamanan ada 3 lapis:
 * 1. requireProfile()  -> harus login & ACTIVE
 * 2. Database grant    -> user hanya punya hak update kolom `full_name`
 * 3. Value di sini     -> kita kirim HANYA full_name ke database
 *
 * Role dan status tidak pernah bisa dikirim dari form ini (PRD section 24).
 */
export async function updateOwnName(
  _prev: ProfileFormState,
  formData: FormData
): Promise<ProfileFormState> {
  const profile = await requireProfile()

  const value = formData.get('full_name')
  const fullName = typeof value === 'string' ? value.trim() : ''

  if (!fullName) return { error: 'Full name is required.' }
  if (fullName.length > 120) return { error: 'Full name is too long.' }
  if (fullName === profile.full_name) return { success: 'Profile updated successfully.' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('profiles')
    .update({ full_name: fullName })
    .eq('id', profile.id)

  if (error) {
    console.error('updateOwnName failed:', error.message)
    return { error: 'Unable to update profile.' }
  }

  revalidatePath('/profile')
  revalidatePath('/dashboard')
  return { success: 'Profile updated successfully.' }
}
