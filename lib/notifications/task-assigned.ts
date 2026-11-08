import { createAdminClient } from '@/lib/supabase/admin'
import { getAppBaseUrl } from '@/lib/app-url'
import { emitNotification } from '@/lib/notifications/service'
import { escapeEmailHtml as h } from '@/lib/email/layout'

/**
 * Event TASK_ASSIGNED (in-app + email) ke assignee. Dipakai create/update task
 * dan approve suggestion (audit A9). Di luar file 'use server' supaya tidak
 * ikut terekspos sebagai server action.
 */
export async function emitTaskAssigned(input: {
  taskId: string
  taskCode: string
  taskTitle: string
  projectId: string
  assigneeId: string
  stamp: string
}): Promise<void> {
  const admin = createAdminClient()
  const { data: project } = await admin
    .from('projects')
    .select('code, name')
    .eq('id', input.projectId)
    .single<{ code: string; name: string }>()

  const projectLabel = project ? `${project.code} · ${project.name}` : '-'

  let baseUrl = ''
  try {
    baseUrl = getAppBaseUrl()
  } catch {
    console.error('[notify] APP_URL missing, skipping assigned email.')
  }

  await emitNotification({
    // Stamp = updated_at saat itu: reassign bolak-balik tetap terkirim,
    // double-submit dalam satu update tetap satu event.
    key: `task-assigned:${input.taskId}:${input.assigneeId}:${input.stamp}`,
    type: 'TASK_ASSIGNED',
    userIds: [input.assigneeId],
    title: `Task ${input.taskCode} ditugaskan kepada Anda`,
    message: `"${input.taskTitle}" di ${projectLabel} ditugaskan kepada Anda.`,
    entityType: 'task',
    entityId: input.taskId,
    email: baseUrl
      ? {
          subject: `[Ditugaskan] ${input.taskCode} ${input.taskTitle}`,
          html: `<p>Halo,</p><p>Task berikut ditugaskan kepada Anda:</p><ul><li><strong>${h(input.taskCode)} ${h(input.taskTitle)}</strong></li><li><strong>Project:</strong> ${h(projectLabel)}</li></ul><p>Lihat detail:<br><a href="${baseUrl}/tasks/${input.taskId}">${baseUrl}/tasks/${input.taskId}</a></p>`,
          category: 'task',
        }
      : null,
  })
}
