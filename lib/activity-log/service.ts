import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'

export type ActivityAction =
  | 'USER_CREATED'
  | 'USER_UPDATED'
  | 'USER_ACTIVATED'
  | 'USER_DEACTIVATED'
  | 'ROLE_CHANGED'
  | 'PROJECT_CREATED'
  | 'PROJECT_UPDATED'
  | 'PROJECT_PM_ADDED'
  | 'PROJECT_PM_REMOVED'
  | 'WORKSTREAM_CREATED'
  | 'WORKSTREAM_UPDATED'
  | 'WORKSTREAM_DELETED'
  | 'TASK_CREATED'
  | 'TASK_UPDATED'
  | 'TASK_ASSIGNED'
  | 'TASK_UNASSIGNED'
  | 'TASK_STATUS_CHANGED'
  | 'TASK_PRIORITY_CHANGED'
  | 'TASK_DEADLINE_CHANGED'
  | 'TASK_EVIDENCE_UPDATED'
  | 'TASK_DELETED'
  | 'TASK_RESTORED'
  | 'SUGGESTION_CREATED'
  | 'SUGGESTION_UPDATED'
  | 'SUGGESTION_APPROVED'
  | 'SUGGESTION_REVISION_REQUESTED'
  | 'SUGGESTION_REJECTED'
  | 'SUGGESTION_CONVERTED'

export type ActivityEntityType = 'project' | 'workstream' | 'task' | 'suggestion' | 'user' | ''

export type LogActivityInput = {
  actorUserId: string | null
  action: ActivityAction
  entityType: ActivityEntityType
  entityId: string
  entityCode?: string
  projectId?: string | null
  /** Detail perubahan saja (old/new). Jangan taruh password/token/secret. */
  metadata?: Record<string, unknown>
  requestId?: string
}

const SECRET_KEYS = ['password', 'token', 'secret', 'api_key', 'apikey', 'service_role', 'key']

function stripSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripSecrets)
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SECRET_KEYS.some((s) => k.toLowerCase().includes(s))) continue
      out[k] = stripSecrets(v)
    }
    return out
  }
  return value
}

/**
 * Satu-satunya pintu tulis activity log (§12).
 *
 * Append-only: tidak ada update/delete dari UI. Gagal tulis dicatat ke
 * console TAPI tidak melempar — pemanggil memutuskan: untuk mutation
 * penting, panggil SEBELUM revalidate dan log kegagalan secara eksplisit
 * (§13: jangan silently ignore).
 *
 * Return true jika tersimpan.
 */
export async function logActivity(input: LogActivityInput): Promise<boolean> {
  const admin = createAdminClient()

  const { error } = await admin.from('activity_logs').insert({
    actor_user_id: input.actorUserId,
    actor_type: input.actorUserId ? 'USER' : 'SYSTEM',
    action: input.action,
    entity_type: input.entityType,
    entity_id: input.entityId,
    entity_code: input.entityCode ?? '',
    project_id: input.projectId ?? null,
    metadata: stripSecrets(input.metadata ?? {}) as Record<string, unknown>,
    request_id: input.requestId ?? null,
  })

  if (error) {
    console.error('[activity] Failed to append log:', error.message)
    return false
  }

  return true
}
