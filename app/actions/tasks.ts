'use server'

import { revalidatePath } from 'next/cache'
import { requireManager, requireProfile } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { isTaskPriority, isTaskStatus } from '@/lib/auth/roles'
import { isProjectManager } from '@/lib/data/projects'
import { getAppBaseUrl } from '@/lib/app-url'
import { notifyTaskDone } from '@/lib/email/notify'
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

  const { error } = await createAdminClient().from('tasks').insert({
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

  if (error) {
    console.error('createTask failed:', error.message)
    return { error: 'Unable to create task. Please try again.' }
  }

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
    .select('status')
    .eq('id', id)
    .single<{ status: TaskStatus }>()

  const { error } = await adminClient
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

  if (error) {
    console.error('updateTask failed:', error.message)
    return { error: 'Unable to update task.' }
  }

  if (before && before.status !== 'DONE' && status === 'DONE') {
    await sendDoneEmail(id)
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
    .select('status')
    .eq('id', id)
    .eq('is_deleted', false)
    .single<{ status: TaskStatus }>()

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
  }

  revalidatePath('/tasks')
  revalidatePath(`/tasks/${id}`)
  revalidatePath('/projects')
  revalidatePath(`/projects/${task.project_id}`)
  return { success: 'Task status updated successfully.' }
}

/**
 * Kirim email ke semua PM saat task menjadi DONE.
 * Gagal kirim tidak menggagalkan update status.
 */
async function sendDoneEmail(taskId: string): Promise<void> {
  const admin = createAdminClient()

  const { data: task } = await admin
    .from('tasks')
    .select('id, title, project_id, assignee_id, evidence_url')
    .eq('id', taskId)
    .single<{
      id: string
      title: string
      project_id: string
      assignee_id: string
      evidence_url: string | null
    }>()

  if (!task) return

  const [{ data: project }, { data: assignee }, { data: managers }] = await Promise.all([
    admin.from('projects').select('name').eq('id', task.project_id).single<{ name: string }>(),
    admin
      .from('profiles')
      .select('full_name, email')
      .eq('id', task.assignee_id)
      .single<{ full_name: string | null; email: string }>(),
    admin.from('project_managers').select('user_id').eq('project_id', task.project_id),
  ])

  const managerIds = ((managers ?? []) as { user_id: string }[]).map((m) => m.user_id)
  if (managerIds.length === 0) return

  const { data: pmProfiles } = await admin
    .from('profiles')
    .select('full_name, email')
    .in('id', managerIds)
    .eq('status', 'ACTIVE')

  const pmEmails = ((pmProfiles ?? []) as { full_name: string | null; email: string }[]).map(
    (pm) => ({ email: pm.email, name: pm.full_name ?? undefined })
  )

  let baseUrl = ''
  try {
    baseUrl = getAppBaseUrl()
  } catch {
    console.error('[notify] APP_URL is not configured, skipping DONE email.')
    return
  }

  await notifyTaskDone({
    pmEmails,
    taskTitle: task.title,
    projectName: project?.name ?? '-',
    assigneeName: assignee ? assignee.full_name || assignee.email : '-',
    evidenceUrl: task.evidence_url,
    taskUrl: `${baseUrl}/tasks/${task.id}`,
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
  const { error } = await createAdminClient()
    .from('tasks')
    .update({ is_deleted: true })
    .eq('id', id)

  if (error) {
    console.error('deleteTask failed:', error.message)
    return { error: 'Unable to delete task.' }
  }

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
    .select('id, assignee_id, project_id')
    .eq('id', id)
    .eq('is_deleted', false)
    .single<{ id: string; assignee_id: string; project_id: string }>()

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

  revalidatePath('/tasks')
  revalidatePath(`/tasks/${id}`)
  revalidatePath(`/projects/${task.project_id}`)
  return { success: 'Evidence saved successfully.' }
}
