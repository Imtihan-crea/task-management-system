import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

/**
 * Tandai semua notifikasi milik user sebagai read.
 * RLS tidak memberi policy tulis, jadi pakai service role
 * dengan filter user_id dari session (aman dari IDOR).
 */
export async function POST() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
  }

  const { error } = await createAdminClient()
    .from('notifications')
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .eq('is_read', false)

  if (error) {
    return NextResponse.json({ error: 'Failed.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
