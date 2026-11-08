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
import { readLimitedField, readMulti } from '@/lib/forms/limits'
import { isValidDateInput } from '@/lib/forms/dates'
import { projectAssignedBody } from '@/lib/email/templates'

function projectAssignedEmail(
  baseUrl: string,
  projectId: string,
  projectCode: string,
  projectName: string
): { subject: string; html: string; category: 'task' } | null {
  if (!baseUrl) return null
  return {
    subject: `[PM] Anda ditambahkan ke project ${projectCode} ${projectName}`,
    html: projectAssignedBody({ baseUrl, projectId, code: projectCode, name: projectName }),
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

  const name = readLimitedField(formData, 'name')
  const client = readLimitedField(formData, 'client')
  const description = readLimitedField(formData, 'description')
  const managerIds = [...new Set(readMulti(formData, 'project_manager_ids'))]
  const startDate = readLimitedField(formData, 'start_date')
  const endDate = readLimitedField(formData, 'end_date')
  const status = readLimitedField(formData, 'status') || 'PLANNING'

  if (!name) return { error: 'Nama Project wajib diisi.' }
  if (managerIds.length === 0) return { error: 'Minimal satu Project Manager wajib dipilih.' }
  if (!isProjectStatus(status)) return { error: 'Pilih status yang valid.' }
  if (!isValidDateInput(startDate) || !isValidDateInput(endDate)) {
    return { error: 'Masukkan tanggal yang valid.' }
  }
  if (startDate && endDate && endDate < startDate) {
    return { error: 'Deadline harus setelah tanggal mulai.' }
  }
  if (!(await assertActiveUsers(managerIds))) {
    return { error: 'Project Manager harus berupa Admin atau Project Manager yang aktif.' }
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
    return { error: 'Tidak dapat membuat Project. Silakan coba lagi.' }
  }

  const managerError = await setProjectManagers(project.id, managerIds)
  if (managerError) {
    console.error('setProjectManagers failed:', managerError.message)
    await admin.from('projects').delete().eq('id', project.id)
    return { error: 'Tidak dapat menetapkan Project Manager. Silakan coba lagi.' }
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
    title: `Anda ditugaskan ke Project ${created?.code ?? ''}`,
    message: `Anda ditambahkan sebagai PM di project "${name}".`,
    entityType: 'project',
    entityId: project.id,
    email: projectAssignedEmail(baseUrl, project.id, created?.code ?? '', name),
  })

  revalidatePath('/projects')
  revalidatePath('/dashboard')
  return { success: 'Project berhasil dibuat.' }
}

export async function updateProject(
  _prev: ProjectFormState,
  formData: FormData
): Promise<ProjectFormState> {
  const profile = await requireManager()

  const id = readLimitedField(formData, 'id')
  const name = readLimitedField(formData, 'name')
  const client = readLimitedField(formData, 'client')
  const description = readLimitedField(formData, 'description')
  const managerIds = [...new Set(readMulti(formData, 'project_manager_ids'))]
  const startDate = readLimitedField(formData, 'start_date')
  const endDate = readLimitedField(formData, 'end_date')
  const status = readLimitedField(formData, 'status')

  if (!id) return { error: 'Project tidak ditemukan.' }
  if (!name) return { error: 'Nama Project wajib diisi.' }
  if (managerIds.length === 0) return { error: 'Minimal satu Project Manager wajib dipilih.' }
  if (!isProjectStatus(status)) return { error: 'Pilih status yang valid.' }
  if (!isValidDateInput(startDate) || !isValidDateInput(endDate)) {
    return { error: 'Masukkan tanggal yang valid.' }
  }
  if (startDate && endDate && endDate < startDate) {
    return { error: 'Deadline harus setelah tanggal mulai.' }
  }
  if (!(await canManageProjectFor(profile, id))) {
    return { error: 'Anda tidak punya izin untuk melakukan aksi ini.' }
  }
  if (!(await assertActiveUsers(managerIds))) {
    return { error: 'Project Manager harus berupa Admin atau Project Manager yang aktif.' }
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
    return { error: 'Anda tidak dapat menghapus diri sendiri sebagai Project Manager. Minta Admin.' }
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
    return { error: 'Tidak dapat memperbarui Project.' }
  }

  const managerError = await setProjectManagers(id, managerIds)
  if (managerError) {
    console.error('setProjectManagers failed:', managerError.message)
    return { error: 'Project tersimpan, tetapi Project Manager tidak dapat diperbarui.' }
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
      title: `Anda ditugaskan ke Project ${before?.code ?? ''}`,
      message: `Anda ditambahkan sebagai PM di project "${name}".`,
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
  return { success: 'Project berhasil diperbarui.' }
}
