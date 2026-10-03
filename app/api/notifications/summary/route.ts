import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * Ringkasan notifikasi untuk bell popover: unread count + 5 terbaru.
 * Auth dari session cookie; tanpa session → 401.
 */
export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
  }

  const [{ count }, { data: recent }] = await Promise.all([
    supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('is_read', false),
    supabase
      .from('notifications')
      .select('id, type, title, message, entity_type, entity_id, is_read, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(5),
  ])

  return NextResponse.json({ unread: count ?? 0, recent: recent ?? [] })
}
