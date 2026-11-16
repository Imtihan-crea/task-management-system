import 'server-only'

import { cache } from 'react'
import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireProfile } from '@/lib/auth/session'
import { decide, projectScope, type AccessContext, type ProjectScope } from '@/lib/auth/access'
import type { Permission } from '@/lib/auth/permissions'
import type { UserRole } from '@/types/profile'

/**
 * Muat konteks wewenang satu user (peran, Super Admin/Developer, aturan per
 * akun, project yang ia kelola). Di-cache per request. Gagal baca tabel baru
 * (migrasi 019 belum jalan) = tanpa aturan per akun, jadi perilaku = paket peran.
 */
export const loadAccess = cache(async (userId: string): Promise<AccessContext> => {
  const admin = createAdminClient()
  const [profileRes, overridesRes, managedRes] = await Promise.all([
    admin.from('profiles').select('role, is_super_admin, is_developer').eq('id', userId).maybeSingle(),
    admin.from('user_permissions').select('permission, project_id, granted').eq('user_id', userId),
    admin.from('project_managers').select('project_id').eq('user_id', userId),
  ])
  let profile = profileRes.data as { role: UserRole; is_super_admin?: boolean; is_developer?: boolean } | null
  if (profileRes.error) {
    console.warn('[access] profile flags read failed:', profileRes.error.message)
    const fallback = await admin.from('profiles').select('role').eq('id', userId).maybeSingle()
    profile = fallback.data as { role: UserRole } | null
  }
  if (overridesRes.error) console.warn('[access] user_permissions read failed:', overridesRes.error.message)

  return {
    userId,
    role: profile?.role ?? 'VIEWER',
    isSuperAdmin: profile?.is_super_admin === true,
    isDeveloper: profile?.is_developer === true,
    overrides: ((overridesRes.data ?? []) as { permission: string; project_id: string | null; granted: boolean }[]).map(
      (o) => ({ permission: o.permission, projectId: o.project_id, granted: o.granted })
    ),
    managedProjectIds: ((managedRes.data ?? []) as { project_id: string }[]).map((r) => r.project_id),
  }
})

/** Punya izin (di project tertentu, atau di project mana pun bila projectId kosong)? */
export async function hasPermission(
  userId: string,
  permission: Permission,
  projectId?: string | null
): Promise<boolean> {
  return decide(await loadAccess(userId), permission, projectId)
}

/** Cakupan project sebuah izin, untuk menyaring dropdown/daftar. */
export async function permissionProjects(userId: string, permission: Permission): Promise<ProjectScope> {
  return projectScope(await loadAccess(userId), permission)
}

/** Pengganti requireAdmin/requireManager: tanpa izin -> dashboard. */
export async function requirePermission(permission: Permission) {
  const profile = await requireProfile()
  if (!(await hasPermission(profile.id, permission))) redirect('/dashboard?denied=1')
  return profile
}

/** Saring query project (kolom id) sesuai cakupan izin. */
export function applyProjectScope<Q extends { in: (c: string, v: string[]) => Q; not: (c: string, op: string, v: string) => Q }>(
  query: Q,
  scope: ProjectScope,
  column = 'id'
): Q {
  if (scope.all) return scope.exclude.length ? query.not(column, 'in', `(${scope.exclude.join(',')})`) : query
  return query.in(column, scope.include.length ? scope.include : ['00000000-0000-0000-0000-000000000000'])
}

const MANAGE_PERMISSIONS: Permission[] = ['projects.edit', 'workstreams.create', 'tasks.create', 'tasks.edit', 'suggestions.review', 'meetings.edit']

/** Project yang boleh ia kelola lewat izin apa pun (untuk daftar project/workstream). */
export async function managedProjects(userId: string): Promise<{ all: boolean; ids: string[] }> {
  const scopes = await Promise.all(MANAGE_PERMISSIONS.map((p) => permissionProjects(userId, p)))
  return { all: scopes.some((s) => s.all), ids: [...new Set(scopes.flatMap((s) => s.include))] }
}
