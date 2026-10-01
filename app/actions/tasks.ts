'use server'

import { revalidatePath } from 'next/cache'
import { requireManager, requireProfile } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { isTaskPriority, isTaskStatus } from '@/lib/auth/roles'
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

  const { data: project } = await admin
    .from('projects')
    .select('project_manager_id')
    .eq('id', task.project_id)
    .single<{ project_manager_id: string | null }>()

  return {
    allowed: project?.project_manager_id === managerId,
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
    const { data: project } = await createAdminClient()
      .from('projects')
      .select('project_manager_id')
      .eq('id', projectId)
      .single<{ project_manager_id: string | null }>()

    if (project?.project_manager_id !== profile.id) {
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

  const { error } = await createAdminClient()
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
    const { data: project } = await admin
      .from('projects')
      .select('project_manager_id')
      .eq('id', task.project_id)
      .single<{ project_manager_id: string | null }>()

    if (project?.project_manager_id !== profile.id) {
      return { error: 'You do not have permission to perform this action.' }
    }
  }

  const { error } = await admin
    .from('tasks')
    .update({ status: status as TaskStatus })
    .eq('id', id)

  if (error) {
    console.error('changeTaskStatus failed:', error.message)
    return { error: 'Unable to update task status.' }
  }

  revalidatePath('/tasks')
  revalidatePath(`/tasks/${id}`)
  revalidatePath('/projects')
  revalidatePath(`/projects/${task.project_id}`)
  return { success: 'Task status updated successfully.' }
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
