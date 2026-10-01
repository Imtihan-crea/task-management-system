import 'server-only'

import { cache } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { Profile } from '@/types/profile'

type CurrentProfile = Pick<
  Profile,
  'id' | 'full_name' | 'email' | 'role' | 'status'
>

/**
 * Satu-satunya pintu masuk untuk membaca "siapa user yang sedang login".
 * Dipakai di Server Component, Server Action, dan Route Handler.
 */
export const getCurrentProfile = cache(async (): Promise<CurrentProfile | null> => {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const { data } = await supabase
    .from('profiles')
    .select('id, full_name, email, role, status')
    .eq('id', user.id)
    .single<CurrentProfile>()

  return data ?? null
})

/**
 * Wajib untuk SETIAP halaman protected.
 * Kalau tidak login -> /login
 * Kalau akun INACTIVE -> tendang keluar (proxy juga akan menendangnya).
 */
export async function requireProfile(): Promise<CurrentProfile> {
  const profile = await getCurrentProfile()

  // INVITED belum boleh masuk halaman internal: dia harus menyelesaikan
  // pengaturan password dulu di /accept-invite.
  if (!profile || profile.status !== 'ACTIVE') {
    redirect('/login')
  }

  return profile
}

/**
 * Wajib untuk /users dan semua operasi admin.
 * Cek di server, bukan cuma sembunyikan menu di frontend (PRD section 8).
 */
export async function requireAdmin(): Promise<CurrentProfile> {
  const profile = await requireProfile()

  if (profile.role !== 'ADMIN') {
    redirect('/dashboard?denied=1')
  }

  return profile
}
