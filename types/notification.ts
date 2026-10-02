export type NotificationType =
  | 'TASK_ASSIGNED'
  | 'TASK_STATUS_CHANGED'
  | 'TASK_DONE'
  | 'TASK_DEADLINE_APPROACHING'
  | 'TASK_OVERDUE'
  | 'SUGGESTION_CREATED'
  | 'SUGGESTION_APPROVED'
  | 'SUGGESTION_REVISION_REQUESTED'
  | 'SUGGESTION_REJECTED'
  | 'TASK_CREATED_FROM_SUGGESTION'
  | 'PROJECT_ASSIGNED'
  | 'PROJECT_STATUS_CHANGED'

export type NotificationEntityType = 'task' | 'project' | 'suggestion' | ''

export interface NotificationItem {
  id: string
  user_id: string
  type: NotificationType
  title: string
  message: string
  entity_type: NotificationEntityType
  entity_id: string
  is_read: boolean
  created_at: string
  read_at: string | null
}

export interface NotificationPreferences {
  user_id: string
  email_enabled: boolean
  email_task_updates: boolean
  email_suggestion_updates: boolean
  email_deadline_alerts: boolean
}

/** Link tujuan saat notifikasi diklik (§30). */
export function notificationHref(
  entityType: NotificationEntityType,
  entityId: string
): string {
  if (entityType === 'task' && entityId) return `/tasks/${entityId}`
  if (entityType === 'project' && entityId) return `/projects/${entityId}`
  if (entityType === 'suggestion' && entityId) return `/task-suggestions/${entityId}`
  return '/dashboard'
}
