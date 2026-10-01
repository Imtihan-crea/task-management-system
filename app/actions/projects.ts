'use server'

import { revalidatePath } from 'next/cache'
import { requireManager } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { isProjectStatus } from '@/lib/auth/roles'
import type { ProjectStatus } from '@/types/project'

export type ProjectFormState = {
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

async function assertCanManageProject(projectId: string, managerId: string, isAdmin: boolean) {
  if (isAdmin) return true

  // Scope minimum (§34): PM hanya boleh kelola project miliknya.
  const { data } = await createAdminClient()
    .from('projects')
    .select('project_manager_id')
    .eq('id', projectId)
    .single<{ project_manager_id: string | null }>()

  return data?.project_manager_id === managerId
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

export async function createProject(
  _prev: ProjectFormState,
  formData: FormData
): Promise<ProjectFormState> {
  await requireManager()

  const name = readField(formData, 'name')
  const client = readField(formData, 'client')
  const description = readField(formData, 'description')
  const projectManagerId = readField(formData, 'project_manager_id')
  const startDate = readField(formData, 'start_date')
  const endDate = readField(formData, 'end_date')
  const status = readField(formData, 'status') || 'PLANNING'

  if (!name) return { error: 'Project name is required.' }
  if (!projectManagerId) return { error: 'Project manager is required.' }
  if (!isProjectStatus(status)) return { error: 'Please choose a valid status.' }
  if (!validDate(startDate) || !validDate(endDate)) {
    return { error: 'Please enter valid dates.' }
  }
  if (startDate && endDate && endDate < startDate) {
    return { error: 'End date must be after start date.' }
  }
  if (!(await assertActiveUser(projectManagerId))) {
    return { error: 'Project manager must be an active user.' }
  }

  const { error } = await createAdminClient().from('projects').insert({
    name,
    client: client || null,
    description: description || null,
    project_manager_id: projectManagerId,
    start_date: startDate || null,
    end_date: endDate || null,
    status: status as ProjectStatus,
  })

  if (error) {
    console.error('createProject failed:', error.message)
    return { error: 'Unable to create project. Please try again.' }
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
  const projectManagerId = readField(formData, 'project_manager_id')
  const startDate = readField(formData, 'start_date')
  const endDate = readField(formData, 'end_date')
  const status = readField(formData, 'status')

  if (!id) return { error: 'Project not found.' }
  if (!name) return { error: 'Project name is required.' }
  if (!projectManagerId) return { error: 'Project manager is required.' }
  if (!isProjectStatus(status)) return { error: 'Please choose a valid status.' }
  if (!validDate(startDate) || !validDate(endDate)) {
    return { error: 'Please enter valid dates.' }
  }
  if (startDate && endDate && endDate < startDate) {
    return { error: 'End date must be after start date.' }
  }
  if (!(await assertCanManageProject(id, profile.id, isAdmin))) {
    return { error: 'You do not have permission to perform this action.' }
  }
  if (!(await assertActiveUser(projectManagerId))) {
    return { error: 'Project manager must be an active user.' }
  }

  const { error } = await createAdminClient()
    .from('projects')
    .update({
      name,
      client: client || null,
      description: description || null,
      project_manager_id: projectManagerId,
      start_date: startDate || null,
      end_date: endDate || null,
      status: status as ProjectStatus,
    })
    .eq('id', id)

  if (error) {
    console.error('updateProject failed:', error.message)
    return { error: 'Unable to update project.' }
  }

  revalidatePath('/projects')
  revalidatePath(`/projects/${id}`)
  revalidatePath('/dashboard')
  return { success: 'Project updated successfully.' }
}
