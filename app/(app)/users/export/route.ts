import type { NextRequest } from 'next/server'
import { requirePermission } from '@/lib/auth/current-access'
import { buildUserQuery, parseUserFilters, type UserListRow } from '@/lib/data/user-list'
import { ROLE_LABELS, STATUS_LABELS } from '@/lib/auth/roles'
import { exportInfo, type ExcelColumn } from '@/lib/export/excel'
import { exportResponse } from '@/lib/export'
import { wibDate } from '@/lib/export/task-columns'
import { allRows } from '@/lib/utils/paginate'
import { todayISO } from '@/lib/utils/dates'

export const dynamic = 'force-dynamic'

/** Daftar User -> Excel. Izin users.view (sama dengan halaman /users); email ikut karena halaman menampilkannya. */
export async function GET(request: NextRequest) {
  const viewer = await requirePermission('users.view')
  const sp = request.nextUrl.searchParams
  const filters = parseUserFilters((k) => sp.get(k) ?? undefined)
  const query = buildUserQuery(filters).order('id')
  const users = await allRows<UserListRow>((from, to) => query.range(from, to))

  const columns: ExcelColumn<UserListRow>[] = [
    { header: 'Nama', width: 26, value: (u) => u.full_name },
    { header: 'Email', width: 34, value: (u) => u.email },
    { header: 'Role', width: 18, value: (u) => (u.is_super_admin ? 'Super Admin' : u.is_developer ? 'Developer' : ROLE_LABELS[u.role]) },
    { header: 'Status', width: 12, value: (u) => STATUS_LABELS[u.status] },
    { header: 'Dibuat', width: 12, value: (u) => wibDate(u.created_at) },
  ]
  const f = [
    filters.q && `Cari: ${filters.q}`,
    filters.role && `Role: ${ROLE_LABELS[filters.role as keyof typeof ROLE_LABELS]}`,
    filters.status && `Status: ${filters.status}`,
  ].filter(Boolean)
  const info = exportInfo(viewer.full_name || viewer.email, [`${users.length} user`, ...(f.length ? [f.join(' · ')] : [])])
  return exportResponse(request, `Users ${todayISO()}`, [{ name: 'Users', title: 'DAFTAR USER', info, columns, rows: users }])
}
