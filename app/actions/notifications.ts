'use server'

import { revalidatePath } from 'next/cache'
import { requireProfile } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'

function on(value: FormDataEntryValue | null): boolean {
  return value === 'on'
}

export async function markNotificationRead(formData: FormData): Promise<void> {
  const profile = await requireProfile()
  const id = formData.get('id')

  if (typeof id !== 'string' || !id) return

  // User hanya boleh mengubah notification miliknya (§31).
  await createAdminClient()
    .from('notifications')
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', profile.id)
    .eq('is_read', false)

  revalidatePath('/notifications')
}

export async function markAllNotificationsRead(): Promise<void> {
  const profile = await requireProfile()

  await createAdminClient()
    .from('notifications')
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq('user_id', profile.id)
    .eq('is_read', false)

  revalidatePath('/notifications')
}

export type PreferenceFormState =
  | { error: string; success?: undefined }
  | { success: string; error?: undefined }
  | undefined

export async function saveNotificationPreferences(
  _prev: PreferenceFormState,
  formData: FormData
): Promise<Exclude<PreferenceFormState, undefined>> {
  const profile = await requireProfile()

  const prefs = {
    user_id: profile.id,
    email_enabled: on(formData.get('email_enabled')),
    email_task_updates: on(formData.get('email_task_updates')),
    email_suggestion_updates: on(formData.get('email_suggestion_updates')),
    email_deadline_alerts: on(formData.get('email_deadline_alerts')),
    email_meeting_updates: on(formData.get('email_meeting_updates')),
  }

  const { error } = await createAdminClient()
    .from('notification_preferences')
    .upsert(prefs, { onConflict: 'user_id' })

  if (error) {
    console.error('saveNotificationPreferences failed:', error.message)
    return { error: 'Unable to save preferences.' }
  }

  revalidatePath('/notifications')
  return { success: 'Preferences saved successfully.' }
}
