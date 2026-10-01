import type { UserRole, UserStatus } from '@/types/profile'
import type { ProjectStatus } from '@/types/project'
import type { TaskPriority, TaskStatus } from '@/types/task'

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

export const PROJECT_STATUSES: ProjectStatus[] = [
  'PLANNING',
  'ACTIVE',
  'ON_HOLD',
  'COMPLETED',
  'CANCELLED',
]

export const TASK_STATUSES: TaskStatus[] = [
  'TODO',
  'IN_PROGRESS',
  'REVIEW',
  'BLOCKED',
  'DONE',
]

export const TASK_PRIORITIES: TaskPriority[] = ['LOW', 'MEDIUM', 'HIGH']

export function isProjectStatus(value: string): value is ProjectStatus {
  return (PROJECT_STATUSES as string[]).includes(value)
}

export function isTaskStatus(value: string): value is TaskStatus {
  return (TASK_STATUSES as string[]).includes(value)
}

export function isTaskPriority(value: string): value is TaskPriority {
  return (TASK_PRIORITIES as string[]).includes(value)
}
