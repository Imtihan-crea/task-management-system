import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { getAppBaseUrl } from '@/lib/app-url'
import { emitNotification } from '@/lib/notifications/service'
import { escapeEmailHtml } from '@/lib/email/layout'
import { taskTransferBody } from '@/lib/email/templates'
import { projectDeciders } from '@/lib/tasks/deciders'
import { tasksDueByLeaveEnd } from '@/lib/tasks/transfer-rules'

type Leave = { id: string; user_id: string; start_date: string; end_date: string }

/**
 * Cuti/sakit disetujui (20 Nov 2026): PM tiap project yang punya task terbuka
 * orang itu dengan deadline sampai hari terakhir cuti diberi tahu (in-app +
 * email, perlu tindakan) dengan tautan ke /tasks/alih?cuti=<id> yang sudah terisi.
 */
export async function notifyLeaveTransfers(leave: Leave, personName: string, kindLabel: string): Promise<void> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('tasks')
    .select('id, code, title, project_id, deadline')
    .eq('assignee_id', leave.user_id)
    .eq('is_deleted', false)
    .not('status', 'in', '("DONE","CANCELLED")')
    .limit(500)
  const due = tasksDueByLeaveEnd((data ?? []) as { id: string; code: string; title: string; project_id: string; deadline: string | null }[], leave.end_date)
  if (due.length === 0) return

  const byProject = new Map<string, typeof due>()
  for (const t of due) byProject.set(t.project_id, [...(byProject.get(t.project_id) ?? []), t])
  let baseUrl = ''
  try {
    baseUrl = getAppBaseUrl()
  } catch {
    /* tautan tidak ditampilkan */
  }
  const range = leave.start_date === leave.end_date ? leave.start_date : `${leave.start_date} s/d ${leave.end_date}`
  for (const [projectId, list] of byProject) {
    const deciders = (await projectDeciders(projectId)).filter((id) => id !== leave.user_id)
    await emitNotification({
      key: `leave-transfer:${leave.id}:${projectId}`,
      type: 'TASK_TRANSFER',
      userIds: deciders,
      title: `${personName} ${kindLabel.toLowerCase()} ${range}: ${list.length} task perlu pengganti`,
      message: list.map((t) => t.code).join(', '),
      entityType: 'task_transfer',
      entityId: leave.id,
      email: {
        subject: `[Alih Task] ${personName} ${kindLabel} ${range}: ${list.length} task`,
        html: taskTransferBody({
          baseUrl,
          taskId: list[0].id,
          code: list.map((t) => t.code).join(', '),
          title: list.length === 1 ? list[0].title : `(${list.length} task)`,
          intro: `${escapeEmailHtml(personName)} ${escapeEmailHtml(kindLabel.toLowerCase())} <strong>${escapeEmailHtml(range)}</strong>. Task berikut deadline-nya sampai hari terakhir cuti dan perlu dialihkan sementara:`,
          linkToList: true,
          listQuery: `cuti=${leave.id}`,
        }),
        category: 'task',
      },
    })
  }
}

/**
 * Cuti ditolak/dibatalkan: alih task yang dibuat dari cuti itu dan belum
 * dimulai ikut dibatalkan; yang sudah berjalan dibiarkan (PM memutuskan)
 * dan PM diberi tahu in-app.
 */
export async function cancelLeaveTransfers(leaveId: string, actorId: string): Promise<void> {
  const admin = createAdminClient()
  const now = new Date().toISOString()
  await admin
    .from('task_transfers')
    .update({ status: 'CANCELLED', decided_by: actorId, decided_at: now, decision_note: 'Cuti/sakit dibatalkan.', updated_at: now })
    .eq('leave_request_id', leaveId)
    .in('status', ['PENDING', 'SCHEDULED'])
  const { data: running } = await admin
    .from('task_transfers')
    .select('id, tasks(code, project_id)')
    .eq('leave_request_id', leaveId)
    .in('status', ['ACTIVE', 'EXPIRED'])
  for (const r of (running ?? []) as unknown as { id: string; tasks: { code: string; project_id: string } | null }[]) {
    if (!r.tasks) continue
    await emitNotification({
      key: `leave-transfer-cancelled:${r.id}`,
      type: 'TASK_TRANSFER',
      userIds: await projectDeciders(r.tasks.project_id),
      title: `Cuti dibatalkan, alih task ${r.tasks.code} masih berjalan`,
      message: 'Kembalikan task ke pemegang asal bila perlu.',
      entityType: 'task_transfer',
      entityId: '',
      email: null,
    })
  }
}
