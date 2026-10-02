'use server'

import { revalidatePath } from 'next/cache'
import { requireManager, requireProfile } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { isTaskPriority, isTaskStatus } from '@/lib/auth/roles'
import { isProjectManager } from '@/lib/data/projects'
import { getAppBaseUrl } from '@/lib/app-url'
import { emitNotification } from '@/lib/notifications/service'
import { logActivity } from '@/lib/activity-log/service'
import type { TaskPriority, TaskStatus } from '@/types/task'

export type TaskFormState = {
  error?: string
  success?: string
} | undefined

function readField(formData: FormData, name: string): string {
  const value = formData.get(name)
  return typeof value === 'string' ? value.trim() : ''
}

function validDate(value: string): boolean {
  if (!value) return true
  return !Number.isNaN(Date.parse(value))
}

async function assertActiveUser(userId: string): Promise<boolean> {
  const { data } = await createAdminClient()
    .from('profiles')
    .select('id')
    .eq('id', userId)
    .eq('status', 'ACTIVE')
    .maybeSingle<{ id: string }>()

  return Boolean(data)
}

/** Pastikan workstream (kalau diisi) memang milik project tersebut. */
async function assertWorkstreamInProject(
  workstreamId: string,
  projectId: string
): Promise<boolean> {
  const { data } = await createAdminClient()
    .from('workstreams')
    .select('id')
    .eq('id', workstreamId)
    .eq('project_id', projectId)
    .maybeSingle<{ id: string }>()

  return Boolean(data)
}

async function assertCanManageTask(taskId: string, managerId: string, isAdmin: boolean) {
  if (isAdmin) return { allowed: true, projectId: '' }

  const admin = createAdminClient()
  const { data: task } = await admin
    .from('tasks')
    .select('project_id')
    .eq('id', taskId)
    .eq('is_deleted', false)
    .single<{ project_id: string }>()

  if (!task) return { allowed: false, projectId: '' }

  return {
    allowed: await isProjectManager(task.project_id, managerId),
    projectId: task.project_id,
  }
}

function validateTaskFields(input: {
  title: string
  projectId: string
  assigneeId: string
  priority: string
  status: string
  startDate: string
  deadline: string
}): string | null {
  if (!input.title) return 'Task name is required.'
  if (!input.projectId) return 'Project is required.'
  if (!input.assigneeId) return 'Assignee is required.'
  if (!isTaskPriority(input.priority)) return 'Please choose a valid priority.'
  if (!isTaskStatus(input.status)) return 'Please choose a valid status.'
  if (!input.deadline) return 'Deadline is required.'
  if (!validDate(input.startDate) || !validDate(input.deadline)) {
    return 'Please enter valid dates.'
  }
  if (input.startDate && input.deadline < input.startDate) {
    return 'Deadline must be after start date.'
  }
  return null
}

export async function createTask(
  _prev: TaskFormState,
  formData: FormData
): Promise<TaskFormState> {
  const profile = await requireManager()

  const title = readField(formData, 'title')
  const description = readField(formData, 'description')
  const projectId = readField(formData, 'project_id')
  const workstreamId = readField(formData, 'workstream_id')
  const assigneeId = readField(formData, 'assignee_id')
  const priority = readField(formData, 'priority') || 'MEDIUM'
  const status = readField(formData, 'status') || 'TODO'
  const startDate = readField(formData, 'start_date')
  const deadline = readField(formData, 'deadline')

  const fieldError = validateTaskFields({
    title,
    projectId,
    assigneeId,
    priority,
    status,
    startDate,
    deadline,
  })
  if (fieldError) return { error: fieldError }

  // PM hanya boleh buat task di project miliknya.
  if (profile.role !== 'ADMIN') {
    if (!(await isProjectManager(projectId, profile.id))) {
      return { error: 'You do not have permission to perform this action.' }
    }
  }

  if (workstreamId && !(await assertWorkstreamInProject(workstreamId, projectId))) {
    return { error: 'Workstream does not belong to this project.' }
  }
  if (!(await assertActiveUser(assigneeId))) {
    return { error: 'Assignee must be an active user.' }
  }

  const { data: created, error } = await createAdminClient()
    .from('tasks')
    .insert({
      title,
      description: description || null,
      project_id: projectId,
      workstream_id: workstreamId || null,
      assignee_id: assigneeId,
      created_by: profile.id,
      priority: priority as TaskPriority,
      status: status as TaskStatus,
      start_date: startDate || null,
      deadline,
    })
    .select('id, code, updated_at')
    .single<{ id: string; code: string; updated_at: string }>()

  if (error || !created) {
    console.error('createTask failed:', error?.message)
    return { error: 'Unable to create task. Please try again.' }
  }

  // Event: TASK_ASSIGNED → assignee baru (in-app + email).
  await emitTaskAssigned({
    taskId: created.id,
    taskCode: created.code,
    taskTitle: title,
    projectId,
    assigneeId,
    stamp: created.updated_at,
  })

  await logActivity({
    actorUserId: profile.id,
    action: 'TASK_CREATED',
    entityType: 'task',
    entityId: created.id,
    entityCode: created.code,
    projectId,
    metadata: {
      task_code: created.code,
      task_title: title,
      assignee_id: assigneeId,
      priority,
      status,
      deadline,
    },
  })

  revalidatePath('/tasks')
  revalidatePath('/projects')
  revalidatePath(`/projects/${projectId}`)
  return { success: 'Task created successfully.' }
}

export async function updateTask(
  _prev: TaskFormState,
  formData: FormData
): Promise<TaskFormState> {
  const profile = await requireManager()
  const isAdmin = profile.role === 'ADMIN'

  const id = readField(formData, 'id')
  const title = readField(formData, 'title')
  const description = readField(formData, 'description')
  const projectId = readField(formData, 'project_id')
  const workstreamId = readField(formData, 'workstream_id')
  const assigneeId = readField(formData, 'assignee_id')
  const priority = readField(formData, 'priority')
  const status = readField(formData, 'status')
  const startDate = readField(formData, 'start_date')
  const deadline = readField(formData, 'deadline')

  if (!id) return { error: 'Task not found.' }

  const fieldError = validateTaskFields({
    title,
    projectId,
    assigneeId,
    priority,
    status,
    startDate,
    deadline,
  })
  if (fieldError) return { error: fieldError }

  const scope = await assertCanManageTask(id, profile.id, isAdmin)
  if (!scope.allowed) {
    return { error: 'You do not have permission to perform this action.' }
  }

  if (workstreamId && !(await assertWorkstreamInProject(workstreamId, projectId))) {
    return { error: 'Workstream does not belong to this project.' }
  }
  if (!(await assertActiveUser(assigneeId))) {
    return { error: 'Assignee must be an active user.' }
  }

  const adminClient = createAdminClient()
  const { data: before } = await adminClient
    .from('tasks')
    .select('status, assignee_id, title, priority, deadline, workstream_id, project_id')
    .eq('id', id)
    .single<{
      status: TaskStatus
      assignee_id: string
      title: string
      priority: TaskPriority
      deadline: string
      workstream_id: string | null
      project_id: string
    }>()

  const { data: updated, error } = await adminClient
    .from('tasks')
    .update({
      title,
      description: description || null,
      project_id: projectId,
      workstream_id: workstreamId || null,
      assignee_id: assigneeId,
      priority: priority as TaskPriority,
      status: status as TaskStatus,
      start_date: startDate || null,
      deadline,
    })
    .eq('id', id)
    .select('id, code, updated_at')
    .single<{ id: string; code: string; updated_at: string }>()

  if (error || !updated) {
    console.error('updateTask failed:', error?.message)
    return { error: 'Unable to update task.' }
  }

  if (before && before.status !== 'DONE' && status === 'DONE') {
    await sendDoneEmail(id)
  }

  // Event: assignee berubah → TASK_ASSIGNED ke assignee baru.
  if (before && before.assignee_id !== assigneeId) {
    await emitTaskAssigned({
      taskId: updated.id,
      taskCode: updated.code,
      taskTitle: title,
      projectId,
      assigneeId,
      stamp: updated.updated_at,
    })
  }

  // Event: status berubah (bukan DONE, itu sudah ditangani) → in-app saja.
  if (before && before.status !== status && status !== 'DONE') {
    await emitTaskStatusChanged({
      taskId: updated.id,
      taskCode: updated.code,
      taskTitle: title,
      projectId,
      fromStatus: before.status,
      toStatus: status as TaskStatus,
    })
  }

  // Audit granular (§7, §10): hanya yang berubah yang dicatat.
  if (before) {
    const taskMeta = { task_code: updated.code, task_title: title }
    if (before.assignee_id !== assigneeId) {
      await logActivity({
        actorUserId: profile.id,
        action: 'TASK_ASSIGNED',
        entityType: 'task',
        entityId: updated.id,
        entityCode: updated.code,
        projectId,
        metadata: {
          ...taskMeta,
          old_assignee_id: before.assignee_id,
          new_assignee_id: assigneeId,
        },
      })
    }
    if (before.status !== status) {
      await logActivity({
        actorUserId: profile.id,
        action: 'TASK_STATUS_CHANGED',
        entityType: 'task',
        entityId: updated.id,
        entityCode: updated.code,
        projectId,
        metadata: { ...taskMeta, old_status: before.status, new_status: status },
      })
    }
    if (before.priority !== priority) {
      await logActivity({
        actorUserId: profile.id,
        action: 'TASK_PRIORITY_CHANGED',
        entityType: 'task',
        entityId: updated.id,
        entityCode: updated.code,
        projectId,
        metadata: { ...taskMeta, old_priority: before.priority, new_priority: priority },
      })
    }
    if (before.deadline !== deadline) {
      await logActivity({
        actorUserId: profile.id,
        action: 'TASK_DEADLINE_CHANGED',
        entityType: 'task',
        entityId: updated.id,
        entityCode: updated.code,
        projectId,
        metadata: { ...taskMeta, old_deadline: before.deadline, new_deadline: deadline },
      })
    }
    const generalChanged =
      before.title !== title ||
      (before.workstream_id ?? '') !== (workstreamId || '') ||
      before.project_id !== projectId
    if (generalChanged) {
      await logActivity({
        actorUserId: profile.id,
        action: 'TASK_UPDATED',
        entityType: 'task',
        entityId: updated.id,
        entityCode: updated.code,
        projectId,
        metadata: { ...taskMeta },
      })
    }
  }

  revalidatePath('/tasks')
  revalidatePath(`/tasks/${id}`)
  revalidatePath('/projects')
  revalidatePath(`/projects/${projectId}`)
  return { success: 'Task updated successfully.' }
}

/**
 * Ubah status saja. TEAM_MEMBER boleh untuk task miliknya sendiri.
 * VIEWER tidak boleh sama sekali.
 */
export async function changeTaskStatus(
  _prev: TaskFormState,
  formData: FormData
): Promise<TaskFormState> {
  const profile = await requireProfile()

  if (profile.role === 'VIEWER') {
    return { error: 'You do not have permission to perform this action.' }
  }

  const id = readField(formData, 'id')
  const status = readField(formData, 'status')

  if (!id) return { error: 'Task not found.' }
  if (!isTaskStatus(status)) return { error: 'Please choose a valid status.' }

  const admin = createAdminClient()
  const { data: task } = await admin
    .from('tasks')
    .select('id, assignee_id, project_id')
    .eq('id', id)
    .eq('is_deleted', false)
    .single<{ id: string; assignee_id: string; project_id: string }>()

  if (!task) return { error: 'Task not found.' }

  // TEAM_MEMBER: hanya task miliknya. ADMIN/PM: semua dalam scope-nya.
  if (profile.role === 'TEAM_MEMBER' && task.assignee_id !== profile.id) {
    return { error: 'You do not have permission to perform this action.' }
  }
  if (profile.role === 'PROJECT_MANAGER') {
    if (!(await isProjectManager(task.project_id, profile.id))) {
      return { error: 'You do not have permission to perform this action.' }
    }
  }

  // Email notifikasi HANYA saat transisi menjadi DONE.
  const { data: before } = await admin
    .from('tasks')
    .select('status, title, code')
    .eq('id', id)
    .eq('is_deleted', false)
    .single<{ status: TaskStatus; title: string; code: string }>()

  if (!before) return { error: 'Task not found.' }
  const wasDone = before.status === 'DONE'

  const { error } = await admin
    .from('tasks')
    .update({ status: status as TaskStatus })
    .eq('id', id)

  if (error) {
    console.error('changeTaskStatus failed:', error.message)
    return { error: 'Unable to update task status.' }
  }

  if (!wasDone && status === 'DONE') {
    await sendDoneEmail(id)
  } else if (before.status !== status) {
    await emitTaskStatusChanged({
      taskId: id,
      taskCode: before.code,
      taskTitle: before.title,
      projectId: task.project_id,
      fromStatus: before.status,
      toStatus: status as TaskStatus,
    })
  }

  if (before.status !== status) {
    await logActivity({
      actorUserId: profile.id,
      action: 'TASK_STATUS_CHANGED',
      entityType: 'task',
      entityId: id,
      entityCode: before.code,
      projectId: task.project_id,
      metadata: {
        task_code: before.code,
        task_title: before.title,
        old_status: before.status,
        new_status: status,
      },
    })
  }

  revalidatePath('/tasks')
  revalidatePath(`/tasks/${id}`)
  revalidatePath('/projects')
  revalidatePath(`/projects/${task.project_id}`)
  return { success: 'Task status updated successfully.' }
}

/**
 * Helper notifikasi task (dipakai create/update/status).
 * Semua lewat unified service — tidak ada email ad-hoc di sini.
 */
async function getTaskContext(taskId: string) {
  const admin = createAdminClient()
  const { data: task } = await admin
    .from('tasks')
    .select('id, code, title, project_id, assignee_id, updated_at')
    .eq('id', taskId)
    .single<{
      id: string
      code: string
      title: string
      project_id: string
      assignee_id: string
      updated_at: string
    }>()

  if (!task) return null

  const [{ data: project }, { data: managers }] = await Promise.all([
    admin.from('projects').select('code, name').eq('id', task.project_id).single<{ code: string; name: string }>(),
    admin.from('project_managers').select('user_id').eq('project_id', task.project_id),
  ])

  return {
    task,
    projectLabel: project ? `${project.code} · ${project.name}` : '-',
    projectName: project?.name ?? '-',
    managerIds: ((managers ?? []) as { user_id: string }[]).map((m) => m.user_id),
  }
}

async function emitTaskAssigned(input: {
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
    title: `Task ${input.taskCode} assigned to you`,
    message: `"${input.taskTitle}" di ${projectLabel} di-assign kepadamu.`,
    entityType: 'task',
    entityId: input.taskId,
    email: baseUrl
      ? {
          subject: `[Assigned] ${input.taskCode} ${input.taskTitle}`,
          html: `<p>Halo,</p><p>Task berikut di-assign kepadamu:</p><ul><li><strong>${input.taskCode} ${input.taskTitle}</strong></li><li><strong>Project:</strong> ${projectLabel}</li></ul><p>Lihat detail:<br><a href="${baseUrl}/tasks/${input.taskId}">${baseUrl}/tasks/${input.taskId}</a></p>`,
          category: 'task',
        }
      : null,
  })
}

async function emitTaskStatusChanged(input: {
  taskId: string
  taskCode: string
  taskTitle: string
  projectId: string
  fromStatus: TaskStatus
  toStatus: TaskStatus
}): Promise<void> {
  const ctx = await getTaskContext(input.taskId)
  if (!ctx) return

  const { data } = await createAdminClient()
    .from('tasks')
    .select('assignee_id')
    .eq('id', input.taskId)
    .single<{ assignee_id: string }>()

  // BLOCKED butuh perhatian: kirim email ke assignee + PM.
  // Status lain tetap in-app saja (policy Optional).
  let email: {
    subject: string
    html: string
    category: 'task'
  } | null = null

  if (input.toStatus === 'BLOCKED') {
    let baseUrl = ''
    try {
      baseUrl = getAppBaseUrl()
    } catch {
      console.error('[notify] APP_URL missing, skipping blocked email.')
    }
    if (baseUrl) {
      email = {
        subject: `[BLOCKED] ${input.taskCode} ${input.taskTitle}`,
        html: `<p>Halo,</p><p>Task berikut terhambat dan membutuhkan perhatian:</p><ul><li><strong>${input.taskCode} ${input.taskTitle}</strong></li><li><strong>Project:</strong> ${ctx.projectLabel}</li><li><strong>Status sebelumnya:</strong> ${input.fromStatus.replace('_', ' ')}</li></ul><p>Lihat detail:<br><a href="${baseUrl}/tasks/${input.taskId}">${baseUrl}/tasks/${input.taskId}</a></p>`,
        category: 'task',
      }
    }
  }

  await emitNotification({
    // Key mencakup updated_at supaya perubahan berulang tetap terkirim.
    key: `task-status:${input.taskId}:${ctx.task.updated_at}`,
    type: 'TASK_STATUS_CHANGED',
    userIds: [...ctx.managerIds, ...(data ? [data.assignee_id] : [])],
    title: `Task ${input.taskCode} → ${input.toStatus.replace('_', ' ')}`,
    message: `"${input.taskTitle}" berubah dari ${input.fromStatus.replace('_', ' ')} menjadi ${input.toStatus.replace('_', ' ')}.`,
    entityType: 'task',
    entityId: input.taskId,
    email,
  })
}

/**
 * Task menjadi DONE: in-app ke assignee + semua PM, email ke semua PM.
 * Dijalankan lewat unified service (§52, §69): SATU-SATUNYA mekanisme
 * DONE notification. Gagal kirim tidak menggagalkan update status.
 */
async function sendDoneEmail(taskId: string): Promise<void> {
  const admin = createAdminClient()

  const { data: task } = await admin
    .from('tasks')
    .select('id, code, title, project_id, assignee_id, evidence_url, updated_at')
    .eq('id', taskId)
    .single<{
      id: string
      code: string
      title: string
      project_id: string
      assignee_id: string
      evidence_url: string | null
      updated_at: string
    }>()

  if (!task) return

  const [{ data: project }, { data: assignee }, { data: managers }] = await Promise.all([
    admin.from('projects').select('code, name').eq('id', task.project_id).single<{ code: string; name: string }>(),
    admin
      .from('profiles')
      .select('full_name, email')
      .eq('id', task.assignee_id)
      .single<{ full_name: string | null; email: string }>(),
    admin.from('project_managers').select('user_id').eq('project_id', task.project_id),
  ])

  const managerIds = ((managers ?? []) as { user_id: string }[]).map((m) => m.user_id)
  const assigneeName = assignee ? assignee.full_name || assignee.email : '-'
  const projectLabel = project ? `${project.code} · ${project.name}` : '-'

  let baseUrl = ''
  try {
    baseUrl = getAppBaseUrl()
  } catch {
    console.error('[notify] APP_URL is not configured, skipping DONE notification.')
    return
  }

  const evidenceBlock = task.evidence_url
    ? `<p>Link evidence:<br><a href="${task.evidence_url}">${task.evidence_url}</a></p>`
    : `<p><em>Tidak ada link evidence yang dilampirkan.</em></p>`

  await emitNotification({
    key: `task-done:${task.id}:${task.updated_at}`,
    type: 'TASK_DONE',
    userIds: [...managerIds, task.assignee_id],
    title: `Task ${task.code} selesai: ${task.title}`,
    message: `${assigneeName} menyelesaikan task ${task.code} di ${projectLabel}.`,
    entityType: 'task',
    entityId: task.id,
    email: {
      subject: `[DONE] ${task.code} ${task.title} — ${project?.name ?? '-'}`,
      html: `<p>Halo,</p>
<p>Kabar baik — task berikut sudah selesai dan membutuhkan perhatian Anda:</p>
<ul>
<li><strong>Task:</strong> ${task.code} ${task.title}</li>
<li><strong>Project:</strong> ${projectLabel}</li>
<li><strong>Dikerjakan oleh:</strong> ${assigneeName}</li>
</ul>
${evidenceBlock}
<p>Lihat detail task di sini:<br><a href="${baseUrl}/tasks/${task.id}">${baseUrl}/tasks/${task.id}</a></p>
<p>Terima kasih.</p>
<p><em>Email ini dikirim otomatis oleh Task Management System. Mohon tidak membalas email ini.</em></p>`,
      category: 'task',
    },
  })
}

export async function deleteTask(
  _prev: TaskFormState,
  formData: FormData
): Promise<TaskFormState> {
  const profile = await requireManager()
  const isAdmin = profile.role === 'ADMIN'

  const id = readField(formData, 'id')
  if (!id) return { error: 'Task not found.' }

  const scope = await assertCanManageTask(id, profile.id, isAdmin)
  if (!scope.allowed) {
    return { error: 'You do not have permission to perform this action.' }
  }

  // Soft delete: data tetap tersimpan, hilang dari list default.
  const { data: deleted, error } = await createAdminClient()
    .from('tasks')
    .update({ is_deleted: true })
    .eq('id', id)
    .select('id, code, title, project_id')
    .single<{ id: string; code: string; title: string; project_id: string }>()

  if (error || !deleted) {
    console.error('deleteTask failed:', error?.message)
    return { error: 'Unable to delete task.' }
  }

  await logActivity({
    actorUserId: profile.id,
    action: 'TASK_DELETED',
    entityType: 'task',
    entityId: deleted.id,
    entityCode: deleted.code,
    projectId: deleted.project_id,
    metadata: { task_code: deleted.code, task_title: deleted.title },
  })

  revalidatePath('/tasks')
  revalidatePath(`/tasks/${id}`)
  revalidatePath('/projects')
  return { success: 'Task deleted successfully.' }
}

/**
 * Submit evidence (link). Assignee boleh untuk task miliknya sendiri,
 * PM/Admin sesuai scope. Tidak mandatory, dan tetap bisa diubah setelah DONE.
 */
export async function submitEvidence(
  _prev: TaskFormState,
  formData: FormData
): Promise<TaskFormState> {
  const profile = await requireProfile()

  if (profile.role === 'VIEWER') {
    return { error: 'You do not have permission to perform this action.' }
  }

  const id = readField(formData, 'id')
  const evidenceUrl = readField(formData, 'evidence_url')

  if (!id) return { error: 'Task not found.' }
  if (evidenceUrl && !/^https?:\/\/.+/i.test(evidenceUrl)) {
    return { error: 'Evidence must be a valid link starting with http(s)://.' }
  }
  if (evidenceUrl.length > 2000) return { error: 'Evidence link is too long.' }

  const admin = createAdminClient()
  const { data: task } = await admin
    .from('tasks')
    .select('id, code, title, assignee_id, project_id')
    .eq('id', id)
    .eq('is_deleted', false)
    .single<{ id: string; code: string; title: string; assignee_id: string; project_id: string }>()

  if (!task) return { error: 'Task not found.' }

  const isAdmin = profile.role === 'ADMIN'
  const isOwner = task.assignee_id === profile.id
  const isPM =
    profile.role === 'PROJECT_MANAGER' &&
    (await isProjectManager(task.project_id, profile.id))

  if (!isAdmin && !isPM && !(profile.role === 'TEAM_MEMBER' && isOwner)) {
    return { error: 'You do not have permission to perform this action.' }
  }

  const { error } = await admin
    .from('tasks')
    .update({ evidence_url: evidenceUrl || null })
    .eq('id', id)

  if (error) {
    console.error('submitEvidence failed:', error.message)
    return { error: 'Unable to save evidence.' }
  }

  await logActivity({
    actorUserId: profile.id,
    action: 'TASK_EVIDENCE_UPDATED',
    entityType: 'task',
    entityId: task.id,
    entityCode: task.code,
    projectId: task.project_id,
    metadata: { task_code: task.code, task_title: task.title },
  })

  revalidatePath('/tasks')
  revalidatePath(`/tasks/${id}`)
  revalidatePath(`/projects/${task.project_id}`)
  return { success: 'Evidence saved successfully.' }
}
