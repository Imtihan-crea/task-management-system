'use server'

import { revalidatePath } from 'next/cache'
import { requireManager } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { isProjectManager } from '@/lib/data/projects'
import { logActivity } from '@/lib/activity-log/service'

export type WorkstreamFormState = {
  error?: string
  success?: string
} | undefined

function readField(formData: FormData, name: string): string {
  const value = formData.get(name)
  return typeof value === 'string' ? value.trim() : ''
}

async function assertCanManageProject(projectId: string, managerId: string, isAdmin: boolean) {
  if (isAdmin) return true
  return isProjectManager(projectId, managerId)
}

export async function createWorkstream(
  _prev: WorkstreamFormState,
  formData: FormData
): Promise<WorkstreamFormState> {
  const profile = await requireManager()
  const isAdmin = profile.role === 'ADMIN'

  const projectId = readField(formData, 'project_id')
  const name = readField(formData, 'name')
  const description = readField(formData, 'description')

  if (!projectId) return { error: 'Project is required.' }
  if (!name) return { error: 'Workstream name is required.' }
  if (!(await assertCanManageProject(projectId, profile.id, isAdmin))) {
    return { error: 'You do not have permission to perform this action.' }
  }

  const { data: created, error } = await createAdminClient()
    .from('workstreams')
    .insert({
      project_id: projectId,
      name,
      description: description || null,
    })
    .select('id, code')
    .single<{ id: string; code: string }>()

  if (error || !created) {
    console.error('createWorkstream failed:', error?.message)
    return { error: 'Unable to create workstream. Please try again.' }
  }

  await logActivity({
    actorUserId: profile.id,
    action: 'WORKSTREAM_CREATED',
    entityType: 'workstream',
    entityId: created.id,
    entityCode: created.code,
    projectId,
    metadata: { workstream_code: created.code, workstream_name: name },
  })

  revalidatePath('/projects')
  revalidatePath(`/projects/${projectId}`)
  return { success: 'Workstream created successfully.' }
}

export async function updateWorkstream(
  _prev: WorkstreamFormState,
  formData: FormData
): Promise<WorkstreamFormState> {
  const profile = await requireManager()
  const isAdmin = profile.role === 'ADMIN'

  const id = readField(formData, 'id')
  const name = readField(formData, 'name')
  const description = readField(formData, 'description')

  if (!id) return { error: 'Workstream not found.' }
  if (!name) return { error: 'Workstream name is required.' }

  const admin = createAdminClient()
  const { data: current } = await admin
    .from('workstreams')
    .select('project_id, code')
    .eq('id', id)
    .single<{ project_id: string; code: string }>()

  if (!current) return { error: 'Workstream not found.' }
  if (!(await assertCanManageProject(current.project_id, profile.id, isAdmin))) {
    return { error: 'You do not have permission to perform this action.' }
  }

  const { error } = await admin
    .from('workstreams')
    .update({ name, description: description || null })
    .eq('id', id)

  if (error) {
    console.error('updateWorkstream failed:', error.message)
    return { error: 'Unable to update workstream.' }
  }

  await logActivity({
    actorUserId: profile.id,
    action: 'WORKSTREAM_UPDATED',
    entityType: 'workstream',
    entityId: id,
    entityCode: current.code,
    projectId: current.project_id,
    metadata: { workstream_code: current.code, workstream_name: name },
  })

  revalidatePath('/projects')
  revalidatePath(`/projects/${current.project_id}`)
  return { success: 'Workstream updated successfully.' }
}

export async function deleteWorkstream(
  _prev: WorkstreamFormState,
  formData: FormData
): Promise<WorkstreamFormState> {
  const profile = await requireManager()
  const isAdmin = profile.role === 'ADMIN'

  const id = readField(formData, 'id')
  if (!id) return { error: 'Workstream not found.' }

  const admin = createAdminClient()
  const { data: current } = await admin
    .from('workstreams')
    .select('project_id, code, name')
    .eq('id', id)
    .single<{ project_id: string; code: string; name: string }>()

  if (!current) return { error: 'Workstream not found.' }
  if (!(await assertCanManageProject(current.project_id, profile.id, isAdmin))) {
    return { error: 'You do not have permission to perform this action.' }
  }

  // Jangan hapus workstream yang sudah memiliki task (non-deleted).
  const { count } = await admin
    .from('tasks')
    .select('id', { count: 'exact', head: true })
    .eq('workstream_id', id)
    .eq('is_deleted', false)

  if ((count ?? 0) > 0) {
    return {
      error: 'Workstream already has tasks and cannot be deleted. Move the tasks first.',
    }
  }

  const { error } = await admin.from('workstreams').delete().eq('id', id)

  if (error) {
    console.error('deleteWorkstream failed:', error.message)
    return { error: 'Unable to delete workstream.' }
  }

  await logActivity({
    actorUserId: profile.id,
    action: 'WORKSTREAM_DELETED',
    entityType: 'workstream',
    entityId: id,
    entityCode: current.code,
    projectId: current.project_id,
    metadata: { workstream_code: current.code, workstream_name: current.name },
  })

  revalidatePath('/projects')
  revalidatePath(`/projects/${current.project_id}`)
  return { success: 'Workstream deleted successfully.' }
}
