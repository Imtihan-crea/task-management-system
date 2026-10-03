import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Bell notifikasi dengan badge unread. Server component: hitung di server,
 * tidak ada polling client (sesuai §47: refresh on page load + manual).
 */
export async function NotificationBell({ userId }: { userId: string }) {
  const admin = createAdminClient()
  const { count } = await admin
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('is_read', false)

  const unread = count ?? 0

  return (
    <Link
      href="/notifications"
      aria-label={unread > 0 ? `${unread} unread notifications` : 'Notifications'}
      className="relative inline-flex min-h-[44px] items-center rounded-lg border border-zinc-700 px-3 py-2 text-sm font-medium text-zinc-200 hover:bg-zinc-800"
    >
      <span aria-hidden="true">🔔</span>
      {unread > 0 && (
        <span className="absolute -right-1 -top-1 inline-flex min-h-[20px] min-w-[20px] items-center justify-center rounded-full bg-red-600 px-1 text-[11px] font-bold text-white">
          {unread > 99 ? '99+' : unread}
        </span>
      )}
    </Link>
  )
}
