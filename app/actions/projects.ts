'use server'

import { revalidatePath } from 'next/cache'
import { requireManager } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { isProjectStatus } from '@/lib/auth/roles'
import { canManageProjectFor } from '@/lib/data/projects'
import { getAppBaseUrl } from '@/lib/app-url'
import { emitNotification } from '@/lib/notifications/service'
import { logActivity } from '@/lib/activity-log/service'
import type { ProjectStatus } from '@/types/project'
import { escapeEmailHtml as h } from '@/lib/email/layout'

function projectAssignedEmail(
  baseUrl: string,
  projectId: string,
  projectCode: string,
  projectName: string
): { subject: string; html: string; category: 'task' } | null {
  if (!baseUrl) return null
  return {
    subject: `[PM] Kamu ditambahkan ke project ${projectCode} ${projectName}`,
    html: `<p>Halo,</p><p>Kamu ditambahkan sebagai Project Manager di project <strong>${h(projectCode)} ${h(projectName)}</strong>.</p><p>Lihat project:<br><a href="${baseUrl}/projects/${projectId}">${baseUrl}/projects/${projectId}</a></p>`,
    category: 'task',
  }
}

function appBaseUrlOrNull(): string {
  try {
    return getAppBaseUrl()
  } catch {
    console.error('[notify] APP_URL missing, skipping project email.')
    return ''
  }
}

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

// Calon PM harus aktif DAN ber-role ADMIN/PROJECT_MANAGER (sama dengan pilihan di UI).
async function assertActiveUsers(userIds: string[]): Promise<boolean> {
  if (userIds.length === 0) return false

  const { count } = await createAdminClient()
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .in('id', userIds)
    .eq('status', 'ACTIVE')
    .in('role', ['ADMIN', 'PROJECT_MANAGER'])

  return (count ?? 0) === userIds.length
}

// Satu transaksi di database (migrasi 014): gagal di tengah = daftar PM lama utuh.
async function setProjectManagers(projectId: string, userIds: string[]) {
  const { error } = await createAdminClient().rpc('set_project_managers', {
    p_project_id: projectId,
    p_user_ids: userIds,
  })
  return error
}

export async function createProject(
  _prev: ProjectFormState,
  formData: FormData
): Promise<ProjectFormState> {
  const actor = await requireManager()

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
    return { error: 'Deadline must be after start date.' }
  }
  if (!(await assertActiveUsers(managerIds))) {
    return { error: 'Project managers must be active Admins or Project Managers.' }
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

  const { data: created } = await admin
    .from('projects')
    .select('code')
    .eq('id', project.id)
    .single<{ code: string }>()

  await logActivity({
    actorUserId: actor.id,
    action: 'PROJECT_CREATED',
    entityType: 'project',
    entityId: project.id,
    entityCode: created?.code ?? '',
    projectId: project.id,
    metadata: { project_code: created?.code ?? '', project_name: name },
  })

  const baseUrl = appBaseUrlOrNull()

  await emitNotification({
    key: `project-assigned:${project.id}:created`,
    type: 'PROJECT_ASSIGNED',
    userIds: managerIds,
    title: `You are assigned to project ${created?.code ?? ''}`,
    message: `Kamu ditambahkan sebagai PM di project "${name}".`,
    entityType: 'project',
    entityId: project.id,
    email: projectAssignedEmail(baseUrl, project.id, created?.code ?? '', name),
  })

  revalidatePath('/projects')
  revalidatePath('/dashboard')
  return { success: 'Project created successfully.' }
}

export async function updateProject(
  _prev: ProjectFormState,
  formData: FormData
): Promise<ProjectFormState> {
  const profile = await requireManager()

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
    return { error: 'Deadline must be after start date.' }
  }
  if (!(await canManageProjectFor(profile, id))) {
    return { error: 'You do not have permission to perform this action.' }
  }
  if (!(await assertActiveUsers(managerIds))) {
    return { error: 'Project managers must be active Admins or Project Managers.' }
  }

  const admin = createAdminClient()

  const { data: before } = await admin
    .from('projects')
    .select('status, code')
    .eq('id', id)
    .single<{ status: ProjectStatus; code: string }>()

  const { data: oldManagers } = await admin
    .from('project_managers')
    .select('user_id')
    .eq('project_id', id)
  const oldManagerIds = new Set(
    ((oldManagers ?? []) as { user_id: string }[]).map((m) => m.user_id)
  )

  // Audit A12: PM tidak boleh melepas dirinya sendiri (langsung kehilangan
  // akses ke project). Admin yang boleh mengatur ulang.
  if (
    profile.role === 'PROJECT_MANAGER' &&
    oldManagerIds.has(profile.id) &&
    !managerIds.includes(profile.id)
  ) {
    return { error: 'You cannot remove yourself as project manager. Ask an Admin.' }
  }

  const { data: updated, error } = await admin
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
    .select('updated_at')
    .single<{ updated_at: string }>()

  if (error || !updated) {
    console.error('updateProject failed:', error?.message)
    return { error: 'Unable to update project.' }
  }

  const managerError = await setProjectManagers(id, managerIds)
  if (managerError) {
    console.error('setProjectManagers failed:', managerError.message)
    return { error: 'Project saved, but managers could not be updated.' }
  }

  // Event: status berubah → in-app ke semua PM (email Optional → skip).
  if (before && before.status !== status) {
    await emitNotification({
      // updated_at: status yang kembali ke nilai lama tetap dinotifikasi lagi.
      key: `project-status:${id}:${status}:${updated.updated_at}`,
      type: 'PROJECT_STATUS_CHANGED',
      userIds: managerIds,
      title: `Project ${before.code} → ${status.replace('_', ' ')}`,
      message: `"${name}" berubah status menjadi ${status.replace('_', ' ')}.`,
      entityType: 'project',
      entityId: id,
      email: null,
    })
  }

  // Event: PM baru ditambahkan → in-app + email.
  const newManagers = managerIds.filter((m) => !oldManagerIds.has(m))
  if (newManagers.length > 0) {
    const baseUrl = appBaseUrlOrNull()
    await emitNotification({
      // updated_at: PM yang dicopot lalu ditambah lagi tetap dinotifikasi.
      key: `project-assigned:${id}:${newManagers.sort().join(',')}:${updated.updated_at}`,
      type: 'PROJECT_ASSIGNED',
      userIds: newManagers,
      title: `You are assigned to project ${before?.code ?? ''}`,
      message: `Kamu ditambahkan sebagai PM di project "${name}".`,
      entityType: 'project',
      entityId: id,
      email: projectAssignedEmail(baseUrl, id, before?.code ?? '', name),
    })
  }

  // Audit: update umum + diff PM.
  await logActivity({
    actorUserId: profile.id,
    action: 'PROJECT_UPDATED',
    entityType: 'project',
    entityId: id,
    entityCode: before?.code ?? '',
    projectId: id,
    metadata: { project_code: before?.code ?? '', project_name: name },
  })
  const removedManagers = [...oldManagerIds].filter((m) => !managerIds.includes(m))
  for (const userId of newManagers) {
    await logActivity({
      actorUserId: profile.id,
      action: 'PROJECT_PM_ADDED',
      entityType: 'project',
      entityId: id,
      entityCode: before?.code ?? '',
      projectId: id,
      metadata: { added_pm_id: userId },
    })
  }
  for (const userId of removedManagers) {
    await logActivity({
      actorUserId: profile.id,
      action: 'PROJECT_PM_REMOVED',
      entityType: 'project',
      entityId: id,
      entityCode: before?.code ?? '',
      projectId: id,
      metadata: { removed_pm_id: userId },
    })
  }

  revalidatePath('/projects')
  revalidatePath(`/projects/${id}`)
  revalidatePath('/dashboard')
  return { success: 'Project updated successfully.' }
}
