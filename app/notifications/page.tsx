import { requireProfile } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { AppShell } from '@/components/layout/AppShell'
import {
  MarkAllReadButton,
  NotificationList,
  PreferencesForm,
} from '@/components/notifications/NotificationComponents'
import type { NotificationItem, NotificationPreferences } from '@/types/notification'

const DEFAULT_PREFS = {
  email_enabled: true,
  email_task_updates: true,
  email_suggestion_updates: true,
  email_deadline_alerts: true,
}

export default async function NotificationsPage() {
  const profile = await requireProfile()
  const admin = createAdminClient()

  const [{ data: items }, { data: prefs }] = await Promise.all([
    admin
      .from('notifications')
      .select('*')
      .eq('user_id', profile.id)
      .order('created_at', { ascending: false })
      .limit(100),
    admin
      .from('notification_preferences')
      .select('*')
      .eq('user_id', profile.id)
      .maybeSingle<NotificationPreferences>(),
  ])

  const notifications = (items ?? []) as NotificationItem[]
  const unreadCount = notifications.filter((n) => !n.is_read).length

  return (
    <AppShell>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Notifications</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up.'}
          </p>
        </div>
        <MarkAllReadButton disabled={unreadCount === 0} />
      </div>

      <div className="mt-4">
        <NotificationList items={notifications} />
      </div>

      <section className="mt-6 rounded-2xl bg-white p-5 shadow dark:bg-zinc-900">
        <h2 className="mb-2 text-lg font-bold">Email Preferences</h2>
        <p className="mb-4 text-sm text-zinc-500">
          In-app notifications always appear. Email can be turned off here.
        </p>
        <PreferencesForm
          initial={{ user_id: profile.id, ...(prefs ?? DEFAULT_PREFS) }}
        />
      </section>
    </AppShell>
  )
}
