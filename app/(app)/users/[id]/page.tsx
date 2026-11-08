import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireAdmin } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { ROLE_LABELS, STATUS_LABELS } from '@/lib/auth/roles'
import { AppShell } from '@/components/layout/AppShell'
import { AccessLinkForm, EditUserForm, StatusToggleForm } from '@/components/users/UserForms'
import type { UserRole, UserStatus } from '@/types/profile'

type ProfileRow = {
  id: string
  full_name: string | null
  email: string
  role: UserRole
  status: UserStatus
  created_at: string
  updated_at: string
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
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

export default async function UserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const viewer = await requireAdmin()

  const { id } = await params
  const admin = createAdminClient()

  const { data: profile } = await admin
    .from('profiles')
    .select('id, full_name, email, role, status, created_at, updated_at')
    .eq('id', id)
    .single<ProfileRow>()

  if (!profile) notFound()

  // Last Login diambil dari Supabase Auth (data reliable, bukan dummy).
  // Sengaja tidak disimpan di profiles.
  let lastLogin: string | null = null
  try {
    const { data: authUser } = await admin.auth.admin.getUserById(id)
    lastLogin = authUser?.user?.last_sign_in_at ?? null
  } catch {
    lastLogin = null
  }

  return (
    <AppShell>
      <Link
        href="/users"
        className="text-sm font-medium text-zinc-500 hover:underline"
      >
        &larr; Kembali ke Users
      </Link>

      <h1 className="mt-2 text-2xl font-bold">Detail User</h1>

      <div className="mt-4 flex flex-col gap-6 lg:flex-row lg:items-start">
        <section className="flex-1 rounded-2xl bg-white p-5 shadow dark:bg-zinc-900">
          <dl>
            <Row label="Nama Lengkap" value={profile.full_name || '-'} />
            <Row label="Email" value={profile.email} />
            <Row label="Role" value={ROLE_LABELS[profile.role]} />
            <Row label="Status" value={STATUS_LABELS[profile.status]} />
            <Row label="Tanggal Dibuat" value={formatDate(profile.created_at)} />
            <Row
              label="Login Terakhir"
              value={lastLogin ? formatDate(lastLogin) : 'Belum pernah Login'}
            />
          </dl>

          <div className="mt-4 max-w-[220px]">
            <StatusToggleForm user={profile} isSelf={viewer.id === profile.id} />
          </div>
          <div className="mt-2 max-w-[320px]">
            <AccessLinkForm user={profile} />
          </div>
        </section>

        <section className="flex-1 rounded-2xl bg-white p-5 shadow dark:bg-zinc-900">
          <h2 className="mb-4 text-lg font-bold">Ubah User</h2>
          <EditUserForm user={profile} isSelf={viewer.id === profile.id} />
        </section>
      </div>
    </AppShell>
  )
}
