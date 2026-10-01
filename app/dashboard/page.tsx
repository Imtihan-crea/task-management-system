import { requireProfile } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { ROLE_LABELS, STATUS_LABELS } from '@/lib/auth/roles'
import { AppShell } from '@/components/layout/AppShell'
import { can } from '@/lib/auth/permissions'
import type { UserStatus } from '@/types/profile'

async function countByStatus(): Promise<Record<UserStatus, number>> {
  const admin = createAdminClient()

  const count = async (status: UserStatus) => {
    const { count: value } = await admin
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('status', status)
    return value ?? 0
  }

  const [invited, active, inactive] = await Promise.all([
    count('INVITED'),
    count('ACTIVE'),
    count('INACTIVE'),
  ])

  return { INVITED: invited, ACTIVE: active, INACTIVE: inactive }
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ denied?: string }>
}) {
  const profile = await requireProfile()
  const params = await searchParams
  const isAdmin = can(profile.role, 'users.view')

  // Statistik hanya untuk Admin, dan nilainya dari database (bukan hard-coded)
  const stats = isAdmin ? await countByStatus() : null
  const totalUsers = stats
    ? stats.INVITED + stats.ACTIVE + stats.INACTIVE
    : null

  return (
    <AppShell>
      {params.denied === '1' && (
        <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm font-medium text-red-700 dark:bg-red-950 dark:text-red-300">
          You do not have permission to perform this action.
        </p>
      )}

      <div className="rounded-2xl bg-white p-6 shadow dark:bg-zinc-900">
        <h1 className="text-2xl font-bold">TASK MANAGEMENT SYSTEM</h1>

        <p className="mt-4 text-lg">
          Welcome, {profile.full_name || profile.email}
        </p>
        <p className="mt-1 text-sm text-zinc-500">
          Role: {ROLE_LABELS[profile.role]}
        </p>
        <p className="text-sm text-zinc-500">
          Status: {STATUS_LABELS[profile.status]}
        </p>

        {stats && (
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {(
              [
                { label: 'TOTAL USERS', value: totalUsers },
                { label: 'ACTIVE', value: stats.ACTIVE },
                { label: 'INACTIVE', value: stats.INACTIVE },
                { label: 'INVITED', value: stats.INVITED },
              ] as const
            ).map((card) => (
              <div key={card.label} className="rounded-xl border p-4">
                <p className="text-xs font-semibold tracking-wide text-zinc-500">
                  {card.label}
                </p>
                <p className="mt-1 text-2xl font-bold">{card.value}</p>
              </div>
            ))}
          </div>
        )}

        <hr className="my-6" />

        <p className="text-sm">Foundation and user management are ready.</p>
        <p className="text-sm text-zinc-500">
          Task Management will be available in the next phase.
        </p>
      </div>
    </AppShell>
  )
}
