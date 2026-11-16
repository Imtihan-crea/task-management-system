import type { UserRole } from '@/types/profile'
import { can, type Permission } from '@/lib/auth/permissions'

/**
 * Wewenang efektif per akun (16 Nov 2026, migrasi 019), murni supaya bisa dites.
 *
 * Urutan keputusan, yang lebih atas menang:
 * 1. Super Admin / Developer: semua izin, tidak bisa dicabut.
 * 2. Aturan akun untuk project itu (user_permissions dengan project_id).
 * 3. Aturan akun untuk semua project (project_id null).
 * 4. Paket peran (lib/auth/permissions.ts). Izin per project dari paket peran
 *    berlaku di semua project untuk ADMIN dan di project yang ia kelola untuk PM,
 *    sama dengan aturan sebelum fitur ini.
 */

export type PermissionScope = 'global' | 'project' | 'role'

/**
 * global  = berlaku di seluruh aplikasi.
 * project = bisa diberi untuk semua project atau project tertentu.
 * role    = tidak diatur per akun (ikut peran): izin lihat dan izin atas task
 *           milik sendiri, karena cakupannya dijaga aturan database (RLS).
 */
export const PERMISSION_SCOPE: Record<Permission, PermissionScope> = {
  'users.view': 'global',
  'users.invite': 'global',
  'users.edit': 'global',
  'users.changeRole': 'global',
  'users.activate': 'global',
  'users.deactivate': 'global',
  'permissions.manage': 'global',
  'profile.viewOwn': 'role',
  'profile.editOwn': 'role',
  'projects.view': 'role',
  'projects.create': 'global',
  'projects.edit': 'project',
  'workstreams.create': 'project',
  'workstreams.edit': 'project',
  'workstreams.delete': 'project',
  'tasks.view': 'role',
  'tasks.create': 'project',
  'tasks.edit': 'project',
  'tasks.cancel': 'project',
  'tasks.delete': 'project',
  'tasks.changeStatusOwn': 'role',
  'tasks.submitEvidenceOwn': 'role',
  'suggestions.create': 'role',
  'suggestions.review': 'project',
  'meetings.view': 'role',
  'meetings.create': 'role',
  // meetings.edit = kelola penuh meeting (field, selesai/batal, peserta).
  'meetings.edit': 'project',
  'meetings.complete': 'role',
  'meetings.cancel': 'role',
  'meetings.manageParticipants': 'role',
  'hr.view': 'global',
  'hr.manage': 'global',
  'tracker.review': 'project',
  'reference.manage': 'global',
}

/** Hanya Super Admin dan Developer; tidak bisa diberikan ke akun lain. */
export const LOCKED_PERMISSIONS: Permission[] = ['permissions.manage']

export const isGrantable = (p: Permission) =>
  PERMISSION_SCOPE[p] !== 'role' && !LOCKED_PERMISSIONS.includes(p)

export type PermissionOverride = {
  permission: string
  projectId: string | null
  granted: boolean
}

export type AccessContext = {
  userId: string
  role: UserRole
  isSuperAdmin: boolean
  isDeveloper: boolean
  overrides: PermissionOverride[]
  managedProjectIds: string[]
}

/** Cakupan project sebuah izin: semua (kecuali exclude) atau hanya include. */
export type ProjectScope = { all: boolean; include: string[]; exclude: string[] }

export const isTopLevel = (ctx: Pick<AccessContext, 'isSuperAdmin' | 'isDeveloper'>) =>
  ctx.isSuperAdmin || ctx.isDeveloper

export function projectScope(ctx: AccessContext, permission: Permission): ProjectScope {
  if (isTopLevel(ctx)) return { all: true, include: [], exclude: [] }
  const rows = ctx.overrides.filter((o) => o.permission === permission)
  const globalRow = rows.find((o) => o.projectId === null)
  const byRole = can(ctx.role, permission)

  let all = globalRow ? globalRow.granted : byRole && ctx.role === 'ADMIN'
  const include = new Set<string>(
    !globalRow && byRole && ctx.role === 'PROJECT_MANAGER' ? ctx.managedProjectIds : []
  )
  const exclude = new Set<string>()
  if (globalRow && !globalRow.granted) all = false

  for (const row of rows) {
    if (row.projectId === null) continue
    if (row.granted) {
      include.add(row.projectId)
      exclude.delete(row.projectId)
    } else {
      exclude.add(row.projectId)
      include.delete(row.projectId)
    }
  }
  return { all, include: [...include], exclude: [...exclude] }
}

/**
 * Boleh `permission`? Untuk izin per project: dengan projectId = di project itu;
 * tanpa projectId = di setidaknya satu project (mis. menampilkan tombol).
 */
export function decide(ctx: AccessContext, permission: Permission, projectId?: string | null): boolean {
  if (isTopLevel(ctx)) return true
  const scope = PERMISSION_SCOPE[permission]
  if (LOCKED_PERMISSIONS.includes(permission)) return false
  if (scope === 'role') return can(ctx.role, permission)
  if (scope === 'global') {
    const row = ctx.overrides.find((o) => o.permission === permission && o.projectId === null)
    return row ? row.granted : can(ctx.role, permission)
  }
  const s = projectScope(ctx, permission)
  if (projectId) return s.all ? !s.exclude.includes(projectId) : s.include.includes(projectId)
  return s.all || s.include.length > 0
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
