'use server'

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
