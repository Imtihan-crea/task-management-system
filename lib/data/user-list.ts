import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { isUserRole, isUserStatus } from '@/lib/auth/roles'
import type { ProfileListItem } from '@/types/profile'

export type UserSortKey = 'created_at' | 'full_name' | 'status' | 'role'

export type UserListFilters = {
  q: string
  role: string
  status: string
  sortKey: UserSortKey
  ascending: boolean
}

export type UserListRow = ProfileListItem & { is_super_admin: boolean; is_developer: boolean }

function parseSort(value: string | undefined): { key: UserSortKey; ascending: boolean } {
  const [rawKey, rawDir] = (value ?? 'created_at.desc').split('.')
  const key = (['created_at', 'full_name', 'status', 'role'] as string[]).includes(rawKey)
    ? (rawKey as UserSortKey)
    : 'created_at'
  return { key, ascending: rawDir === 'asc' }
}

/** Bersihkan input search supaya aman untuk sintaks or() PostgREST. */
function sanitizeSearch(value: string | undefined): string {
  return (value ?? '').replace(/[,()*%]/g, ' ').trim().slice(0, 60)
}

/** Param URL /users -> filter. Satu sumber untuk halaman dan export Excel. */
export function parseUserFilters(get: (key: string) => string | undefined): UserListFilters {
  const role = get('role') ?? ''
  const status = get('status') ?? ''
  const { key, ascending } = parseSort(get('sort'))
  return {
    q: sanitizeSearch(get('q')),
    role: isUserRole(role) ? role : '',
    status: isUserStatus(status) ? status : '',
    sortKey: key,
    ascending,
  }
}

/** Query daftar user (belum ber-limit/range; pemanggil yang menentukan). */
export function buildUserQuery(f: UserListFilters) {
  let query = createAdminClient()
    .from('profiles')
    .select('id, full_name, email, role, status, created_at, is_super_admin, is_developer')
    .order(f.sortKey, { ascending: f.ascending })
    .is('deleted_at', null) // akun dihapus disembunyikan; riwayatnya tetap

  if (f.q) query = query.or(`full_name.ilike.%${f.q}%,email.ilike.%${f.q}%`)
  if (f.role) query = query.eq('role', f.role)
  if (f.status) query = query.eq('status', f.status)
  return query
}
