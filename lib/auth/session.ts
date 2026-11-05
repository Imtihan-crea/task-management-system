import 'server-only'

import { cache } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { Profile } from '@/types/profile'

type CurrentProfile = Pick<
  Profile,
  'id' | 'full_name' | 'email' | 'role' | 'status' | 'must_change_password'
>

type LegacyProfile = Omit<CurrentProfile, 'must_change_password'>

/**
 * Ambil profil user. Kalau migrasi `011_must_change_password.sql` belum
 * dijalankan, kolomnya belum ada (PostgREST error 42703) — jangan sampai
 * SEMUA halaman jadi tidak bisa dibuka. Fallback: baca kolom lama dan
 * anggap `must_change_password = false`, sambil mencatat peringatan.
 */
async function fetchProfile(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
): Promise<CurrentProfile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, email, role, status, must_change_password')
    .eq('id', userId)
    .single<CurrentProfile>()

  if (!error) return data ?? null

  if (error.code === '42703') {
    console.warn(
      '[schema] profiles.must_change_password belum ada. Jalankan database/migrations/011_must_change_password.sql.'
    )

    const { data: legacy } = await supabase
      .from('profiles')
      .select('id, full_name, email, role, status')
      .eq('id', userId)
      .single<LegacyProfile>()

    return legacy ? { ...legacy, must_change_password: false } : null
  }

  console.error('[session] Failed to load profile:', error.message)
  return null
}

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

  return fetchProfile(supabase, user.id)
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
