import { requireProfile } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'
import { ROLE_LABELS, STATUS_LABELS } from '@/lib/auth/roles'
import { AppShell } from '@/components/layout/AppShell'
import { EditOwnNameForm } from '@/components/profile/EditOwnNameForm'

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 border-b py-3 last:border-0 sm:flex-row sm:justify-between sm:gap-4">
      <dt className="text-sm text-zinc-500">{label}</dt>
      <dd className="text-sm font-medium break-all">{value}</dd>
    </div>
  )
}

export default async function ProfilePage() {
  const profile = await requireProfile()

  const supabase = await createClient()
  const { data } = await supabase
    .from('profiles')
    .select('created_at')
    .eq('id', profile.id)
    .single<{ created_at: string }>()

  return (
    <AppShell>
      <h1 className="text-2xl font-bold">My Profile</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Anda hanya bisa mengubah nama sendiri. Role dan status diatur oleh
        administrator.
      </p>

      <div className="mt-4 flex flex-col gap-6 lg:flex-row lg:items-start">
        <section className="flex-1 rounded-2xl bg-white p-5 shadow dark:bg-zinc-900">
          <h2 className="mb-2 text-lg font-bold">Account</h2>
          <dl>
            <Row label="Email" value={profile.email} />
            <Row label="Role" value={ROLE_LABELS[profile.role]} />
            <Row label="Status" value={STATUS_LABELS[profile.status]} />
            <Row
              label="Created Date"
              value={data?.created_at ? formatDate(data.created_at) : '-'}
            />
          </dl>
        </section>

        <section id="edit-name" className="flex-1 rounded-2xl bg-white p-5 shadow scroll-mt-20 dark:bg-zinc-900">
          <h2 className="mb-4 text-lg font-bold">Edit Name</h2>
          <EditOwnNameForm fullName={profile.full_name ?? ''} />
        </section>
      </div>
    </AppShell>
  )
}
