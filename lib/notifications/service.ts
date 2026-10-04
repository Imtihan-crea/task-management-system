import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmail } from '@/lib/email/notify'
import type {
  NotificationEntityType,
  NotificationPreferences,
  NotificationType,
} from '@/types/notification'

export type EmailCategory = 'task' | 'suggestion' | 'deadline' | 'meeting'

export type EmitInput = {
  /** Kunci unik event. Event yang sama tidak pernah dikirim dua kali (§27). */
  key: string
  type: NotificationType
  userIds: string[]
  title: string
  message: string
  entityType: NotificationEntityType
  entityId: string
  email?: {
    subject: string
    html: string
    category: EmailCategory
  } | null
}

function categoryAllowed(
  prefs: NotificationPreferences | null,
  category: EmailCategory
): boolean {
  // Default ON kalau user belum pernah menyimpan preferensi.
  if (!prefs) return true
  if (!prefs.email_enabled) return false
  if (category === 'task') return prefs.email_task_updates
  if (category === 'suggestion') return prefs.email_suggestion_updates
  if (category === 'meeting') return prefs.email_meeting_updates
  return prefs.email_deadline_alerts
}

/**
 * Satu-satunya pintu keluar notifikasi (§52).
 *
 * Alur: klaim event_key dulu (atomic) → tulis in-app → kirim email
 * sesuai policy + preferensi. Gagal di langkah mana pun tidak melempar
 * error ke pemanggil — core transaction tidak boleh rollback karena
 * notifikasi gagal (§28).
 */
export async function emitNotification(input: EmitInput): Promise<{
  emitted: boolean
  notifiedUsers: number
  emailsSent: number
}> {
  const empty = { emitted: false, notifiedUsers: 0, emailsSent: 0 }
  const userIds = [...new Set(input.userIds.filter(Boolean))]
  if (userIds.length === 0) return empty

  const admin = createAdminClient()

  // 1. Klaim event. Kalau key sudah ada = duplicate → berhenti.
  const { error: claimError } = await admin
    .from('notification_events')
    .insert({ event_key: input.key })

  if (claimError) {
    // 23505 = unique violation → event sudah pernah diproses.
    if (claimError.code === '23505') return empty
    console.error('[notify] Failed to claim event:', claimError.message)
    return empty
  }

  // 2. Tulis in-app untuk semua penerima.
  const { error: insertError } = await admin.from('notifications').insert(
    userIds.map((user_id) => ({
      user_id,
      type: input.type,
      title: input.title,
      message: input.message,
      entity_type: input.entityType,
      entity_id: input.entityId,
    }))
  )

  if (insertError) {
    console.error('[notify] Failed to insert notifications:', insertError.message)
    return empty
  }

  // 3. Email sesuai policy + preferensi (opsional per event).
  let emailsSent = 0
  if (input.email) {
    const { data: prefs } = await admin
      .from('notification_preferences')
      .select('*')
      .in('user_id', userIds)

    const prefMap = new Map(
      ((prefs ?? []) as NotificationPreferences[]).map((p) => [p.user_id, p])
    )

    const allowedIds = userIds.filter((id) =>
      categoryAllowed(prefMap.get(id) ?? null, input.email!.category)
    )

    if (allowedIds.length > 0) {
      const { data: profiles } = await admin
        .from('profiles')
        .select('id, full_name, email')
        .in('id', allowedIds)
        .eq('status', 'ACTIVE')

      const recipients = (
        (profiles ?? []) as { id: string; full_name: string | null; email: string }[]
      ).map((p) => ({ email: p.email, name: p.full_name ?? undefined }))

      if (recipients.length > 0) {
        const ok = await sendEmail({
          to: recipients,
          subject: input.email.subject,
          html: input.email.html,
        })
        if (ok) emailsSent = recipients.length
      }
    }
  }

  return { emitted: true, notifiedUsers: userIds.length, emailsSent }
}
