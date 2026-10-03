import Link from 'next/link'
import { requireAdmin } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { isUserRole, isUserStatus, ROLE_LABELS, STATUS_LABELS, USER_ROLES, USER_STATUSES } from '@/lib/auth/roles'
import { AppShell } from '@/components/layout/AppShell'
import { InviteUserForm } from '@/components/users/InviteUserForm'
import { StatusToggleForm } from '@/components/users/UserForms'
import type { ProfileListItem } from '@/types/profile'

type SortKey = 'created_at' | 'full_name' | 'status' | 'role'

const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: 'created_at.desc', label: 'Created Date (newest)' },
  { value: 'created_at.asc', label: 'Created Date (oldest)' },
  { value: 'full_name.asc', label: 'Name (A-Z)' },
  { value: 'full_name.desc', label: 'Name (Z-A)' },
  { value: 'status.asc', label: 'Status (A-Z)' },
  { value: 'role.asc', label: 'Role (A-Z)' },
]

function parseSort(value: string | undefined): { key: SortKey; ascending: boolean } {
  const [rawKey, rawDir] = (value ?? 'created_at.desc').split('.')
  const key = (['created_at', 'full_name', 'status', 'role'] as string[]).includes(rawKey)
    ? (rawKey as SortKey)
    : 'created_at'
  return { key, ascending: rawDir === 'asc' }
}

/** Bersihkan input search supaya aman untuk sintaks or() PostgREST. */
function sanitizeSearch(value: string | undefined): string {
  return (value ?? '').replace(/[,()*%]/g, ' ').trim().slice(0, 60)
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireAdmin()

  const params = await searchParams
  const q = sanitizeSearch(
    typeof params.q === 'string' ? params.q : undefined
  )
  const roleFilter =
    typeof params.role === 'string' && isUserRole(params.role) ? params.role : ''
  const statusFilter =
    typeof params.status === 'string' && isUserStatus(params.status) ? params.status : ''
  const { key: sortKey, ascending } = parseSort(
    typeof params.sort === 'string' ? params.sort : undefined
  )

  const admin = createAdminClient()
  let query = admin
    .from('profiles')
    .select('id, full_name, email, role, status, created_at')
    .order(sortKey, { ascending })
    .limit(200)

  if (q) query = query.or(`full_name.ilike.%${q}%,email.ilike.%${q}%`)
  if (roleFilter) query = query.eq('role', roleFilter)
  if (statusFilter) query = query.eq('status', statusFilter)

  const { data, error } = await query
  const users = (data ?? []) as ProfileListItem[]

  return (
    <AppShell>
      <h1 className="text-2xl font-bold">User Management</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Kelola user, role, dan status. Hanya ADMIN yang bisa akses halaman ini.
      </p>

      {/* Search + Filter (PRD section 10 & 11) */}
      <form
        method="get"
        className="mt-4 flex flex-col gap-3 rounded-2xl bg-white p-4 shadow sm:flex-row sm:items-end dark:bg-zinc-900"
      >
        <div className="flex-1">
          <label htmlFor="q" className="mb-1 block text-sm font-medium">
            Search
          </label>
          <input
            id="q"
            name="q"
            type="search"
            defaultValue={q}
            placeholder="Cari nama atau email"
            className="min-h-[44px] w-full rounded-lg border px-3 py-2 text-base outline-none focus:border-black dark:border-zinc-700 dark:bg-zinc-800"
          />
        </div>

        <div>
          <label htmlFor="role" className="mb-1 block text-sm font-medium">
            Role
          </label>
          <select
            id="role"
            name="role"
            defaultValue={roleFilter}
            className="min-h-[44px] rounded-lg border px-3 py-2 text-base outline-none focus:border-black dark:border-zinc-700 dark:bg-zinc-800"
          >
            <option value="">All</option>
            {USER_ROLES.map((role) => (
              <option key={role} value={role}>
                {ROLE_LABELS[role]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="status" className="mb-1 block text-sm font-medium">
            Status
          </label>
          <select
            id="status"
            name="status"
            defaultValue={statusFilter}
            className="min-h-[44px] rounded-lg border px-3 py-2 text-base outline-none focus:border-black dark:border-zinc-700 dark:bg-zinc-800"
          >
            <option value="">All</option>
            {USER_STATUSES.map((status) => (
              <option key={status} value={status}>
                {STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="sort" className="mb-1 block text-sm font-medium">
            Sort
          </label>
          <select
            id="sort"
            name="sort"
            defaultValue={`${sortKey}.${ascending ? 'asc' : 'desc'}`}
            className="min-h-[44px] rounded-lg border px-3 py-2 text-base outline-none focus:border-black dark:border-zinc-700 dark:bg-zinc-800"
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <button
          type="submit"
          className="min-h-[44px] rounded-lg bg-kasuat-gold px-5 py-2 font-semibold text-kasuat-black"
        >
          Apply
        </button>
      </form>

      {error ? (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm font-medium text-red-700 dark:bg-red-950 dark:text-red-300">
          Something went wrong. Please try again.
        </p>
      ) : users.length === 0 ? (
        <p className="mt-4 rounded-2xl bg-white p-8 text-center text-sm text-zinc-500 shadow dark:bg-zinc-900">
          {q || roleFilter || statusFilter
            ? 'No users match your search or filter.'
            : 'No users yet. Invite your first user below.'}
        </p>
      ) : (
        <>
          {/* Desktop: table */}
          <div className="mt-4 hidden overflow-x-auto rounded-2xl bg-white shadow md:block dark:bg-zinc-900">
            <table className="w-full text-left text-sm">
              <thead className="border-b text-xs uppercase text-zinc-500">
                <tr>
                  <th scope="col" className="px-4 py-3">Name</th>
                  <th scope="col" className="px-4 py-3">Email</th>
                  <th scope="col" className="px-4 py-3">Role</th>
                  <th scope="col" className="px-4 py-3">Status</th>
                  <th scope="col" className="px-4 py-3">Created</th>
                  <th scope="col" className="px-4 py-3">Action</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} className="border-b last:border-0">
                    <td className="px-4 py-3 font-medium">
                      {user.full_name || '-'}
                    </td>
                    <td className="px-4 py-3">{user.email}</td>
                    <td className="px-4 py-3">{ROLE_LABELS[user.role]}</td>
                    <td className="px-4 py-3">{STATUS_LABELS[user.status]}</td>
                    <td className="px-4 py-3">{formatDate(user.created_at)}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`/users/${user.id}`}
                          className="inline-flex min-h-[44px] items-center rounded-lg border px-3 py-1 font-medium"
                        >
                          View
                        </Link>
                        <div className="w-[140px]">
                          <StatusToggleForm
                            user={{
                              id: user.id,
                              full_name: user.full_name,
                              email: user.email,
                              role: user.role,
                              status: user.status,
                            }}
                          />
                        </div>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile: card list (PRD section 34) */}
          <ul className="mt-4 flex flex-col gap-3 md:hidden">
            {users.map((user) => (
              <li
                key={user.id}
                className="rounded-2xl bg-white p-4 shadow dark:bg-zinc-900"
              >
                <p className="font-semibold">{user.full_name || '-'}</p>
                <p className="break-all text-sm text-zinc-500">{user.email}</p>
                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                  <span className="rounded-full border px-2 py-1">
                    {ROLE_LABELS[user.role]}
                  </span>
                  <span className="rounded-full border px-2 py-1">
                    {STATUS_LABELS[user.status]}
                  </span>
                </div>
                <p className="mt-2 text-xs text-zinc-500">
                  Created {formatDate(user.created_at)}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Link
                    href={`/users/${user.id}`}
                    className="inline-flex min-h-[44px] items-center rounded-lg border px-4 py-2 font-medium"
                  >
                    View
                  </Link>
                  <div className="w-full max-w-[160px]">
                    <StatusToggleForm
                      user={{
                        id: user.id,
                        full_name: user.full_name,
                        email: user.email,
                        role: user.role,
                        status: user.status,
                      }}
                    />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="mt-6">
        <InviteUserForm />
      </div>
    </AppShell>
  )
}
