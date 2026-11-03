import 'server-only'

import { cache } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { Profile } from '@/types/profile'

type CurrentProfile = Pick<
  Profile,
  'id' | 'full_name' | 'email' | 'role' | 'status' | 'must_change_password'
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
    .select('id, full_name, email, role, status, must_change_password')
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

  // Admin membuat user dengan password awal + opsi wajib ganti password
  // (3 Nov 2026). Selama flag aktif, semua halaman internal dialihkan ke
  // /change-password supaya password sementara tidak dipakai permanen.
  if (profile.must_change_password) {
    redirect('/change-password')
  }

  return profile
}

/**
 * Khusus halaman /change-password: user harus login & ACTIVE, tapi TIDAK
 * boleh dialihkan ke /change-password lagi (menghindari redirect loop).
 */
export async function requireProfileForPasswordChange(): Promise<CurrentProfile> {
  const profile = await getCurrentProfile()

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

/**
 * Wajib untuk operasi project/task/workstream.
 * ADMIN boleh semua, PROJECT_MANAGER boleh (scope "own" dicek per aksi).
 */
export async function requireManager(): Promise<CurrentProfile> {
  const profile = await requireProfile()

  if (profile.role !== 'ADMIN' && profile.role !== 'PROJECT_MANAGER') {
    redirect('/dashboard?denied=1')
  }

  return profile
}
