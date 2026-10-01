import type { UserRole } from '@/types/profile'

/**
 * Permission Matrix (PRD Phase 2 section 7)
 *
 * Prinsip: "Role menentukan capability."
 * Capability "Later" sengaja TIDAK dibuat permission di sini,
 * supaya tidakterneira ada tapi belum ada fiturnya.
 */
export type Permission =
  | 'users.view'
  | 'users.invite'
  | 'users.edit'
  | 'users.changeRole'
  | 'users.activate'
  | 'users.deactivate'
  | 'profile.viewOwn'
  | 'profile.editOwn'
  | 'projects.view'
  | 'projects.create'
  | 'projects.edit'
  | 'workstreams.create'
  | 'workstreams.edit'
  | 'workstreams.delete'
  | 'tasks.view'
  | 'tasks.create'
  | 'tasks.edit'
  | 'tasks.changeStatusOwn'
  | 'tasks.delete'

const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  ADMIN: [
    'users.view',
    'users.invite',
    'users.edit',
    'users.changeRole',
    'users.activate',
    'users.deactivate',
    'profile.viewOwn',
    'profile.editOwn',
    'projects.view',
    'projects.create',
    'projects.edit',
    'workstreams.create',
    'workstreams.edit',
    'workstreams.delete',
    'tasks.view',
    'tasks.create',
    'tasks.edit',
    'tasks.changeStatusOwn',
    'tasks.delete',
  ],
  PROJECT_MANAGER: [
    'profile.viewOwn',
    'profile.editOwn',
    'projects.view',
    'projects.create',
    'projects.edit',
    'workstreams.create',
    'workstreams.edit',
    'workstreams.delete',
    'tasks.view',
    'tasks.create',
    'tasks.edit',
    'tasks.changeStatusOwn',
    'tasks.delete',
  ],
  TEAM_MEMBER: [
    'profile.viewOwn',
    'profile.editOwn',
    'projects.view',
    'tasks.view',
    'tasks.changeStatusOwn',
  ],
  VIEWER: ['profile.viewOwn', 'profile.editOwn', 'projects.view', 'tasks.view'],
}

export function can(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false
}

export function isAdmin(role: UserRole): boolean {
  return role === 'ADMIN'
}
