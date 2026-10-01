import type { UserRole, UserStatus } from '@/types/profile'

export const USER_ROLES: UserRole[] = [
  'ADMIN',
  'PROJECT_MANAGER',
  'TEAM_MEMBER',
  'VIEWER',
]

export const USER_STATUSES: UserStatus[] = ['INVITED', 'ACTIVE', 'INACTIVE']

export const ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: 'ADMIN',
  PROJECT_MANAGER: 'PROJECT MANAGER',
  TEAM_MEMBER: 'TEAM MEMBER',
  VIEWER: 'VIEWER',
}

export const STATUS_LABELS: Record<UserStatus, string> = {
  INVITED: 'INVITED',
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
}

export function isUserRole(value: string): value is UserRole {
  return (USER_ROLES as string[]).includes(value)
}

export function isUserStatus(value: string): value is UserStatus {
  return (USER_STATUSES as string[]).includes(value)
}
