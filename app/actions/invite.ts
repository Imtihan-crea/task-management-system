'use server'

import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Dipanggil SETELAH user invited selesai membuat password di /accept-invite.
 *
 * Tujuannya memindahkan status INVITED -> ACTIVE.
 *
 * Kenapa pakai service role? User biasa tidak boleh mengubah `status`
 * (database hanya memberi hak UPDATE pada kolom full_name).
 * Ini disengaja supaya tidak ada cara lain mengubah status.
 */
export async function completeInvite() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login?reason=expired')
  }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('id, status')
    .eq('id', user.id)
    .single<{ id: string; status: string }>()

  if (profile && profile.status === 'INVITED') {
    await admin.from('profiles').update({ status: 'ACTIVE' }).eq('id', user.id)
  }

  revalidatePath('/dashboard')
  redirect('/dashboard')
}

/**
 * Menghitung URL aplikasi sendiri, tanpa bergantung env var.
 * Supaya tidak salah kirim ke localhost saat di production.
 */
export async function getAppBaseUrl(): Promise<string> {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim()
  if (explicit) return explicit.replace(/\/+$/, '')

  const headerList = await headers()
  const host = headerList.get('host')
  if (!host) return ''

  const isLocal = host.startsWith('localhost') || host.startsWith('127.0.0.1')
  const protocol = headerList.get('x-forwarded-proto') ?? (isLocal ? 'http' : 'https')

  return `${protocol}://${host}`
}
