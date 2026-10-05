import Link from 'next/link'
import { requireProfile } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { ROLE_LABELS, STATUS_LABELS } from '@/lib/auth/roles'
import { AppShell } from '@/components/layout/AppShell'
import { PreferencesForm } from '@/components/notifications/NotificationComponents'
import { SyncBadge } from '@/components/meetings/MeetingBadges'
import { PageHeader } from '@/components/ui/primitives'
import type { NotificationPreferences } from '@/types/notification'

const DEFAULT_PREFS = {
  email_enabled: true,
  email_task_updates: true,
  email_suggestion_updates: true,
  email_deadline_alerts: true,
  email_meeting_updates: true,
}

export default async function SettingsPage() {
  const profile = await requireProfile()
  const admin = createAdminClient()

  const { data: prefs } = await admin
    .from('notification_preferences')
    .select('*')
    .eq('user_id', profile.id)
    .maybeSingle<NotificationPreferences>()

  return (
    <AppShell>
      <PageHeader title="Settings" subtitle="Pengaturan akun dan notifikasi." />

      <section className="mt-4 rounded-2xl bg-white p-5 shadow dark:bg-zinc-900">
        <h2 className="mb-2 text-lg font-bold">Account</h2>
        <dl>
          <div className="flex flex-col gap-0.5 border-b py-2.5 last:border-0 sm:flex-row sm:justify-between sm:gap-4">
            <dt className="text-sm text-zinc-500">Email</dt>
            <dd className="text-sm font-medium break-all">{profile.email}</dd>
          </div>
          <div className="flex flex-col gap-0.5 border-b py-2.5 last:border-0 sm:flex-row sm:justify-between sm:gap-4">
            <dt className="text-sm text-zinc-500">Name</dt>
            <dd className="text-sm font-medium">{profile.full_name || '-'}</dd>
          </div>
          <div className="flex flex-col gap-0.5 border-b py-2.5 last:border-0 sm:flex-row sm:justify-between sm:gap-4">
            <dt className="text-sm text-zinc-500">Role</dt>
            <dd className="text-sm font-medium">{ROLE_LABELS[profile.role]}</dd>
          </div>
          <div className="flex flex-col gap-0.5 border-b py-2.5 last:border-0 sm:flex-row sm:justify-between sm:gap-4">
            <dt className="text-sm text-zinc-500">Status</dt>
            <dd className="text-sm font-medium">{STATUS_LABELS[profile.status]}</dd>
          </div>
        </dl>
        <p className="mt-3 text-sm text-zinc-500">
          Role dan status diatur oleh administrator. Ubah nama di{' '}
          <Link href="/profile" className="font-semibold text-kasuat-deep-gold hover:underline">
            My Profile
          </Link>
          .
        </p>
      </section>

      <section id="preferences" className="mt-6 rounded-2xl bg-white p-5 shadow dark:bg-zinc-900">
        <h2 className="mb-2 text-lg font-bold">Email Preferences</h2>
        <p className="mb-4 text-sm text-zinc-500">
          In-app notifications always appear. Email can be turned off here.
        </p>
        <PreferencesForm
          initial={{ user_id: profile.id, ...(prefs ?? DEFAULT_PREFS) }}
        />
      </section>

      <section className="mt-6 rounded-2xl bg-white p-5 shadow dark:bg-zinc-900">
        <h2 className="mb-2 text-lg font-bold">Integrations</h2>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-base font-semibold">Google Calendar</h3>
          <SyncBadge status="NOT_CONNECTED" />
        </div>
        <p className="mt-2 text-sm text-zinc-500">
          Kasuat adalah source of truth untuk meeting; Google Calendar hanya
          synchronization layer. Fondasi sync (status, retry, mapping event)
          sudah siap di setiap meeting — koneksi OAuth menyusul di tahap
          berikutnya.
        </p>
        <ul className="mt-2 list-disc pl-5 text-sm text-zinc-500">
          <li>Mencentang &ldquo;Add to Google Calendar&rdquo; saat membuat meeting akan dicatat sebagai permintaan sync.</li>
          <li>Status sync tiap meeting terlihat di halaman detail meeting.</li>
          <li>Kegagalan sync tidak pernah menghapus meeting (data Kasuat aman).</li>
        </ul>
      </section>
    </AppShell>
  )
}
