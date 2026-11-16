'use server'

import { revalidatePath } from 'next/cache'
import { requireProfile } from '@/lib/auth/session'
import { hasPermission } from '@/lib/auth/current-access'
import { createAdminClient } from '@/lib/supabase/admin'
import { emitNotification } from '@/lib/notifications/service'
import { readLimitedField } from '@/lib/forms/limits'

export type CommentFormState = { error?: string; success?: string } | undefined

/**
 * Komentar pemeriksa pada satu aktivitas tracker (pengganti komentar sel di
 * sheet). Boleh: pemegang hr.view, atau tracker.review di project entri itu.
 * Pemilik entri mendapat notifikasi in-app (tanpa email, supaya tidak banjir).
 */
export async function addWorkLogComment(_prev: CommentFormState, formData: FormData): Promise<CommentFormState> {
  const profile = await requireProfile()
  const logId = readLimitedField(formData, 'work_log_id')
  const body = readLimitedField(formData, 'comment')
  if (!body) return { error: 'Komentar kosong.' }

  const admin = createAdminClient()
  const { data: log } = await admin
    .from('work_logs')
    .select('id, user_id, project_id, work_date, activity')
    .eq('id', logId)
    .maybeSingle<{ id: string; user_id: string; project_id: string | null; work_date: string; activity: string }>()
  if (!log) return { error: 'Aktivitas tidak ditemukan.' }
  const allowed =
    (await hasPermission(profile.id, 'hr.view')) ||
    (log.project_id !== null && (await hasPermission(profile.id, 'tracker.review', log.project_id)))
  if (!allowed) return { error: 'Anda tidak punya izin untuk melakukan aksi ini.' }

  const { data: comment, error } = await admin
    .from('work_log_comments')
    .insert({ work_log_id: log.id, author_id: profile.id, body })
    .select('id')
    .single<{ id: string }>()
  if (error) {
    console.error('addWorkLogComment failed:', error.message)
    return { error: 'Gagal menyimpan komentar. Silakan coba lagi.' }
  }
  if (log.user_id !== profile.id) {
    await emitNotification({
      key: `tracker-comment:${comment.id}`,
      type: 'TRACKER_COMMENT',
      userIds: [log.user_id],
      title: 'Komentar baru di Daily Tracker',
      message: `${profile.full_name || profile.email} mengomentari "${log.activity}" (${log.work_date}).`,
      entityType: 'tracker',
      entityId: log.work_date,
      email: null,
    })
  }
  revalidatePath('/tracker', 'layout')
  if (log.project_id) revalidatePath(`/projects/${log.project_id}`)
  return { success: 'Komentar terkirim.' }
}
