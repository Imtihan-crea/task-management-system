'use server'

import { revalidatePath } from 'next/cache'
import { requireManager } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { isProjectStatus } from '@/lib/auth/roles'
import { isProjectManager } from '@/lib/data/projects'
import type { ProjectStatus } from '@/types/project'

export type ProjectFormState = {
  error?: string
  success?: string
} | undefined

function readField(formData: FormData, name: string): string {
  const value = formData.get(name)
  return typeof value === 'string' ? value.trim() : ''
}

function readMulti(formData: FormData, name: string): string[] {
  return formData
    .getAll(name)
    .filter((v): v is string => typeof v === 'string')
    .map((v) => v.trim())
    .filter(Boolean)
}

function validDate(value: string): boolean {
  if (!value) return true
  return !Number.isNaN(Date.parse(value))
}

async function assertActiveUsers(userIds: string[]): Promise<boolean> {
  if (userIds.length === 0) return false

  const { count } = await createAdminClient()
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .in('id', userIds)
    .eq('status', 'ACTIVE')

  return (count ?? 0) === userIds.length
}

async function setProjectManagers(projectId: string, userIds: string[]) {
  const admin = createAdminClient()

  const { error: deleteError } = await admin
    .from('project_managers')
    .delete()
    .eq('project_id', projectId)

  if (deleteError) return deleteError

  if (userIds.length === 0) return null

  const { error } = await admin.from('project_managers').insert(
    userIds.map((user_id) => ({ project_id: projectId, user_id }))
  )

  return error
}

export async function createProject(
  _prev: ProjectFormState,
  formData: FormData
): Promise<ProjectFormState> {
  await requireManager()

  const name = readField(formData, 'name')
  const client = readField(formData, 'client')
  const description = readField(formData, 'description')
  const managerIds = [...new Set(readMulti(formData, 'project_manager_ids'))]
  const startDate = readField(formData, 'start_date')
  const endDate = readField(formData, 'end_date')
  const status = readField(formData, 'status') || 'PLANNING'

  if (!name) return { error: 'Project name is required.' }
  if (managerIds.length === 0) return { error: 'At least one project manager is required.' }
  if (!isProjectStatus(status)) return { error: 'Please choose a valid status.' }
  if (!validDate(startDate) || !validDate(endDate)) {
    return { error: 'Please enter valid dates.' }
  }
  if (startDate && endDate && endDate < startDate) {
    return { error: 'End date must be after start date.' }
  }
  if (!(await assertActiveUsers(managerIds))) {
    return { error: 'Project managers must be active users.' }
  }

  const admin = createAdminClient()
  const { data: project, error } = await admin
    .from('projects')
    .insert({
      name,
      client: client || null,
      description: description || null,
      start_date: startDate || null,
      end_date: endDate || null,
      status: status as ProjectStatus,
    })
    .select('id')
    .single<{ id: string }>()

  if (error || !project) {
    console.error('createProject failed:', error?.message)
    return { error: 'Unable to create project. Please try again.' }
  }

  const managerError = await setProjectManagers(project.id, managerIds)
  if (managerError) {
    console.error('setProjectManagers failed:', managerError.message)
    await admin.from('projects').delete().eq('id', project.id)
    return { error: 'Unable to assign project managers. Please try again.' }
  }

  revalidatePath('/projects')
  revalidatePath('/dashboard')
  return { success: 'Project created successfully.' }
}

export async function updateProject(
  _prev: ProjectFormState,
  formData: FormData
): Promise<ProjectFormState> {
  const profile = await requireManager()
  const isAdmin = profile.role === 'ADMIN'

  const id = readField(formData, 'id')
  const name = readField(formData, 'name')
  const client = readField(formData, 'client')
  const description = readField(formData, 'description')
  const managerIds = [...new Set(readMulti(formData, 'project_manager_ids'))]
  const startDate = readField(formData, 'start_date')
  const endDate = readField(formData, 'end_date')
  const status = readField(formData, 'status')

  if (!id) return { error: 'Project not found.' }
  if (!name) return { error: 'Project name is required.' }
  if (managerIds.length === 0) return { error: 'At least one project manager is required.' }
  if (!isProjectStatus(status)) return { error: 'Please choose a valid status.' }
  if (!validDate(startDate) || !validDate(endDate)) {
    return { error: 'Please enter valid dates.' }
  }
  if (startDate && endDate && endDate < startDate) {
    return { error: 'End date must be after start date.' }
  }
  if (!isAdmin && !(await isProjectManager(id, profile.id))) {
    return { error: 'You do not have permission to perform this action.' }
  }
  if (!(await assertActiveUsers(managerIds))) {
    return { error: 'Project managers must be active users.' }
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('projects')
    .update({
      name,
      client: client || null,
      description: description || null,
      start_date: startDate || null,
      end_date: endDate || null,
      status: status as ProjectStatus,
    })
    .eq('id', id)

  if (error) {
    console.error('updateProject failed:', error.message)
    return { error: 'Unable to update project.' }
  }

  const managerError = await setProjectManagers(id, managerIds)
  if (managerError) {
    console.error('setProjectManagers failed:', managerError.message)
    return { error: 'Project saved, but managers could not be updated.' }
  }

  revalidatePath('/projects')
  revalidatePath(`/projects/${id}`)
  revalidatePath('/dashboard')
  return { success: 'Project updated successfully.' }
}
