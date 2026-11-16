import Link from 'next/link'
import { notFound } from 'next/navigation'
import { hasPermission, requirePermission } from '@/lib/auth/current-access'
import { PermissionsSection } from '@/components/users/PermissionsSection'
import { TopActionForms } from '@/components/users/TopActionForms'
import { EmployeeProfileForm } from '@/components/hr/EmployeeProfileForm'
import { loadReferences } from '@/lib/hr/data'
import type { EmployeeFields } from '@/lib/hr/employee'
import { createAdminClient } from '@/lib/supabase/admin'
import { ROLE_LABELS, STATUS_LABELS } from '@/lib/auth/roles'
import { AppShell } from '@/components/layout/AppShell'
import { AccessLinkForm, EditUserForm, StatusToggleForm } from '@/components/users/UserForms'
import type { UserRole, UserStatus } from '@/types/profile'
import { formatDateTime } from '@/lib/utils/dates'

type ProfileRow = {
  id: string
  full_name: string | null
  email: string
  role: UserRole
  status: UserStatus
  created_at: string
  updated_at: string
  is_super_admin: boolean
  is_developer: boolean
  deleted_at: string | null
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 border-b py-3 last:border-0 sm:flex-row sm:justify-between sm:gap-4">
      <dt className="text-sm text-zinc-600 dark:text-zinc-400">{label}</dt>
      <dd className="text-sm font-medium break-all">{value}</dd>
    </div>
  )
}

export default async function UserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const viewer = await requirePermission('users.view')
  const [canManagePermissions, canViewHr, canManageHr] = await Promise.all([
    hasPermission(viewer.id, 'permissions.manage'),
    hasPermission(viewer.id, 'hr.view'),
    hasPermission(viewer.id, 'hr.manage'),
  ])

  const { id } = await params
  const admin = createAdminClient()

  const { data: profile } = await admin
    .from('profiles')
    .select('id, full_name, email, role, status, created_at, updated_at, is_super_admin, is_developer, deleted_at, division, position_title, position_level, join_date, annual_leave_quota')
    .eq('id', id)
    .single<ProfileRow & EmployeeFields>()

  if (!profile) notFound()
  const refs = canViewHr || canManageHr ? await loadReferences(['DIVISION', 'POSITION']) : []

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
        className="text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:underline"
      >
        &larr; Kembali ke Users
      </Link>

      <h1 className="mt-2 text-2xl font-bold">Detail User</h1>

      <div className="mt-4 flex flex-col gap-6 lg:flex-row lg:items-start">
        <section className="flex-1 rounded-2xl bg-white p-5 shadow dark:bg-zinc-900">
          <dl>
            <Row label="Nama Lengkap" value={profile.full_name || '-'} />
            <Row label="Email" value={profile.email} />
            <Row label="Role" value={profile.is_super_admin ? 'Super Admin' : profile.is_developer ? 'Developer' : ROLE_LABELS[profile.role]} />
            <Row label="Status" value={STATUS_LABELS[profile.status]} />
            <Row label="Tanggal Dibuat" value={formatDateTime(profile.created_at)} />
            <Row
              label="Login Terakhir"
              value={lastLogin ? formatDateTime(lastLogin) : 'Belum pernah Login'}
            />
          </dl>

          {profile.deleted_at ? (
            <p role="status" className="mt-4 rounded-lg bg-zinc-100 p-3 text-sm font-medium dark:bg-zinc-800">
              Akun dihapus pada {formatDateTime(profile.deleted_at)}. Tidak bisa login; riwayatnya tetap ada.
            </p>
          ) : (
            <>
              <div className="mt-4 max-w-[220px]">
                <StatusToggleForm user={profile} isSelf={viewer.id === profile.id} />
              </div>
              <div className="mt-2 max-w-[320px]">
                <AccessLinkForm user={profile} />
              </div>
            </>
          )}
        </section>

        {!profile.deleted_at && (
          <section className="flex-1 rounded-2xl bg-white p-5 shadow dark:bg-zinc-900">
            <h2 className="mb-4 text-lg font-bold">Ubah User</h2>
            <EditUserForm user={profile} isSelf={viewer.id === profile.id} />
          </section>
        )}
      </div>

      {(canViewHr || canManageHr) && !profile.deleted_at && (
        <section className="mt-6 rounded-2xl bg-white p-5 shadow dark:bg-zinc-900">
          <h2 className="mb-4 text-lg font-bold">Data Karyawan</h2>
          <EmployeeProfileForm
            userId={profile.id}
            values={profile}
            divisions={refs.filter((r) => r.list === 'DIVISION' && !r.archived_at).map((r) => r.label)}
            positions={refs.filter((r) => r.list === 'POSITION' && !r.archived_at).map((r) => r.label)}
            canEdit={canManageHr}
          />
        </section>
      )}

      {canManagePermissions && !profile.deleted_at && (
        <section className="mt-6 rounded-2xl bg-white p-5 shadow dark:bg-zinc-900">
          <h2 className="mb-4 text-lg font-bold">Tindakan Super Admin</h2>
          <TopActionForms
            user={profile}
            canDelete={!profile.is_super_admin && !profile.is_developer && viewer.id !== profile.id}
          />
        </section>
      )}

      {canManagePermissions && !profile.deleted_at && (
        <div className="mt-6">
          <PermissionsSection user={profile} />
        </div>
      )}
    </AppShell>
  )
}
