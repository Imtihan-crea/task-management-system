'use server'

import { revalidatePath } from 'next/cache'
import { requireProfile } from '@/lib/auth/session'
import { hasPermission, requirePermission } from '@/lib/auth/current-access'
import type { Permission } from '@/lib/auth/permissions'
import { createAdminClient } from '@/lib/supabase/admin'
import { isTaskPriority, isTaskStatus, taskStatusLabel } from '@/lib/auth/roles'
import {
  CLOSED_PROJECT_ERROR,
  canManageProjectFor,
  isProjectClosed,
} from '@/lib/data/projects'
import { canActOnTask, canPickStatus, submitTarget } from '@/lib/auth/task-access'
import { getAppBaseUrl } from '@/lib/app-url'
import { emitNotification } from '@/lib/notifications/service'
import { emitTaskAssigned } from '@/lib/notifications/task-assigned'
import { projectDeciders } from '@/lib/tasks/deciders'
import { logActivity } from '@/lib/activity-log/service'
import type { TaskPriority, TaskStatus } from '@/types/task'
import type { UserRole } from '@/types/profile'
import { assertActiveUser, assertWorkstreamInProject } from '@/lib/data/assertions'
import { readLimitedField } from '@/lib/forms/limits'
import { isValidDateInput } from '@/lib/forms/dates'
import { taskBlockedBody, taskReviewBody } from '@/lib/email/templates'
import { readInput, toForm } from '@/lib/bulk'
import { bulk } from '@/lib/bulk-server'

export type TaskFormState = {
  error?: string
  success?: string
} | undefined

/** Pastikan workstream (kalau diisi) memang milik project tersebut. */
async function assertCanManageTask(taskId: string, profile: { id: string }, permission: Permission) {
  // ADMIN juga memuat task: task terhapus ditolak (audit C15) dan projectId
  // asli dipakai pemanggil (cek pindah project / project tertutup).
  const admin = createAdminClient()
  const { data: task } = await admin
    .from('tasks')
    .select('project_id')
    .eq('id', taskId)
    .eq('is_deleted', false)
    .single<{ project_id: string }>()

  if (!task) return { allowed: false, projectId: '' }

  return {
    allowed: await canManageProjectFor(profile, task.project_id, permission),
    projectId: task.project_id,
  }
}

// Satu aturan untuk ubah status / submit / cancel / evidence (lihat lib/auth/task-access.ts).
async function canActOnLoadedTask(
  profile: { id: string; role: UserRole },
  task: { assignee_id: string; project_id: string }
): Promise<boolean> {
  // Pemegang tasks.edit di project ini (Admin, PM project, atau diberi per akun) selalu boleh.
  if (await hasPermission(profile.id, 'tasks.edit', task.project_id)) return true
  // Admin tanpa tasks.edit (dicabut per akun) tinggal hak assignee.
  if (profile.role === 'ADMIN') return task.assignee_id === profile.id
  return canActOnTask(profile.role, { isAssignee: task.assignee_id === profile.id, managesProject: false })
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
  if (!input.title) return 'Nama Task wajib diisi.'
  if (!input.projectId) return 'Project wajib diisi.'
  if (!input.assigneeId) return 'Assignee wajib diisi.'
  if (!isTaskPriority(input.priority)) return 'Pilih prioritas yang valid.'
  if (!isTaskStatus(input.status)) return 'Pilih status yang valid.'
  if (!input.deadline) return 'Deadline wajib diisi.'
  if (!isValidDateInput(input.startDate) || !isValidDateInput(input.deadline)) {
    return 'Masukkan tanggal yang valid.'
  }
  if (input.startDate && input.deadline < input.startDate) {
    return 'Deadline harus setelah tanggal mulai.'
  }
  return null
}

export async function createTask(
  _prev: TaskFormState,
  formData: FormData
): Promise<TaskFormState> {
  const profile = await requirePermission('tasks.create')

  const title = readLimitedField(formData, 'title')
  const description = readLimitedField(formData, 'description')
  const projectId = readLimitedField(formData, 'project_id')
  const workstreamId = readLimitedField(formData, 'workstream_id')
  const assigneeId = readLimitedField(formData, 'assignee_id')
  const priority = readLimitedField(formData, 'priority') || 'MEDIUM'
  const status = readLimitedField(formData, 'status') || 'TODO'
  const startDate = readLimitedField(formData, 'start_date')
  const deadline = readLimitedField(formData, 'deadline')

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

  // Task baru selalu terbuka — DONE/CANCELLED/REVIEW hanya lewat tombol submit.
  if (status === 'DONE' || status === 'CANCELLED' || status === 'REVIEW') {
    return { error: 'Task baru tidak dapat dibuat sebagai DONE, CANCELLED, atau Menunggu Review PM.' }
  }

  // PM hanya boleh buat task di project miliknya.
  if (!(await canManageProjectFor(profile, projectId, 'tasks.create'))) {
    return { error: 'Anda tidak punya izin untuk melakukan aksi ini.' }
  }
  if (await isProjectClosed(projectId)) return { error: CLOSED_PROJECT_ERROR }

  if (workstreamId && !(await assertWorkstreamInProject(workstreamId, projectId))) {
    return { error: 'Workstream bukan milik Project ini.' }
  }
  if (!(await assertActiveUser(assigneeId))) {
    return { error: 'Assignee harus berupa user aktif.' }
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
    return { error: 'Tidak dapat membuat Task. Silakan coba lagi.' }
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
  return { success: 'Task berhasil dibuat.' }
}

export async function updateTask(
  _prev: TaskFormState,
  formData: FormData
): Promise<TaskFormState> {
  const profile = await requirePermission('tasks.edit')

  const id = readLimitedField(formData, 'id')
  const title = readLimitedField(formData, 'title')
  const description = readLimitedField(formData, 'description')
  const projectId = readLimitedField(formData, 'project_id')
  const workstreamId = readLimitedField(formData, 'workstream_id')
  const assigneeId = readLimitedField(formData, 'assignee_id')
  const priority = readLimitedField(formData, 'priority')
  const status = readLimitedField(formData, 'status')
  const startDate = readLimitedField(formData, 'start_date')
  const deadline = readLimitedField(formData, 'deadline')

  if (!id) return { error: 'Task tidak ditemukan.' }

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

  // DONE/CANCELLED hanya lewat tombol submit (submitTask/cancelTask) supaya
  // tanggalnya selalu tercatat. Dropdown edit: status terbuka, plus status
  // terminal lama bila task sudah selesai (audit A1: edit tanpa reopen).
  const isTerminal = status === 'DONE' || status === 'CANCELLED'

  const scope = await assertCanManageTask(id, profile, 'tasks.edit')
  if (!scope.allowed) {
    return { error: 'Anda tidak punya izin untuk melakukan aksi ini.' }
  }
  // Pindah project: PM juga harus PM di project tujuan (sama seperti createTask).
  if (projectId !== scope.projectId && !(await canManageProjectFor(profile, projectId, 'tasks.edit'))) {
    return { error: 'Anda tidak punya izin untuk melakukan aksi ini.' }
  }
  // Pindah ke project tertutup ditolak (audit B14).
  if (projectId !== scope.projectId && (await isProjectClosed(projectId))) {
    return { error: CLOSED_PROJECT_ERROR }
  }

  if (workstreamId && !(await assertWorkstreamInProject(workstreamId, projectId))) {
    return { error: 'Workstream bukan milik Project ini.' }
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

  // Assignee lama yang kini nonaktif boleh tetap; assignee baru wajib aktif (audit C11).
  if (before?.assignee_id !== assigneeId && !(await assertActiveUser(assigneeId))) {
    return { error: 'Assignee harus berupa user aktif.' }
  }

  if (isTerminal && before?.status !== status) {
    return { error: 'Gunakan tombol Submit / Batalkan di bawah untuk menutup task.' }
  }
  if (status === 'REVIEW' && before?.status !== 'REVIEW') {
    return { error: 'Status Menunggu Review PM hanya lewat tombol Submit.' }
  }

  const { data: updated, error } = await adminClient
    .from('tasks')
    .update({
      title,
      description: description || null,
      project_id: projectId,
      workstream_id: workstreamId || null,
      assignee_id: assigneeId,
      priority: priority as TaskPriority,
      start_date: startDate || null,
      deadline,
      // Status terminal yang tidak diubah: biarkan status dan tanggalnya.
      // Status terbuka: tanggal submit dibersihkan (reopen oleh PM/Admin).
      // REVIEW yang tidak diubah: tanggal submit consultant tetap.
      ...(isTerminal || status === 'REVIEW'
        ? {}
        : { status: status as TaskStatus, completed_at: null, cancelled_at: null }),
    })
    .eq('id', id)
    .select('id, code, updated_at')
    .single<{ id: string; code: string; updated_at: string }>()

  if (error || !updated) {
    console.error('updateTask failed:', error?.message)
    return { error: 'Tidak dapat memperbarui Task.' }
  }

  // Catatan: transisi ke DONE tidak mungkin lewat sini (guard di atas
  // menolak status terminal) — notifikasi DONE hanya dari submitTask/decideReview.

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
  return { success: 'Task berhasil diperbarui.' }
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
    return { error: 'Anda tidak punya izin untuk melakukan aksi ini.' }
  }

  const id = readLimitedField(formData, 'id')
  const status = readLimitedField(formData, 'status')

  if (!id) return { error: 'Task tidak ditemukan.' }
  if (!isTaskStatus(status)) return { error: 'Pilih status yang valid.' }

  // DONE/CANCELLED hanya lewat tombol submit (ada tanggalnya).
  if (status === 'DONE' || status === 'CANCELLED') {
    return { error: 'Gunakan tombol Submit / Batalkan di bawah untuk menutup task.' }
  }

  const admin = createAdminClient()
  const { data: task } = await admin
    .from('tasks')
    .select('id, assignee_id, project_id')
    .eq('id', id)
    .eq('is_deleted', false)
    .single<{ id: string; assignee_id: string; project_id: string }>()

  if (!task) return { error: 'Task tidak ditemukan.' }

  // TEAM_MEMBER: hanya task miliknya. ADMIN/PM: semua dalam scope-nya.
  if (!(await canActOnLoadedTask(profile, task))) {
    return { error: 'Anda tidak punya izin untuk melakukan aksi ini.' }
  }

  // Baca status lama (guard balapan + notifikasi perubahan).
  const { data: before } = await admin
    .from('tasks')
    .select('status, title, code')
    .eq('id', id)
    .eq('is_deleted', false)
    .single<{ status: TaskStatus; title: string; code: string }>()

  if (!before) return { error: 'Task tidak ditemukan.' }

  // Task terminal dikunci: buka ulang hanya lewat form edit penuh (PM/Admin).
  if (before.status === 'DONE' || before.status === 'CANCELLED') {
    return { error: 'Task ini terkunci. Minta PM atau Admin untuk membukanya kembali.' }
  }
  // REVIEW hanya lewat Submit; consultant tidak bisa keluar dari REVIEW.
  if (!canPickStatus(await hasPermission(profile.id, 'tasks.edit', task.project_id), before.status, status)) {
    return {
      error: before.status === 'REVIEW'
        ? 'Task ini menunggu review PM. Tunggu PM menyetujui atau mengembalikannya.'
        : 'Gunakan tombol Submit untuk menyerahkan task ke PM.',
    }
  }

  // Guard status: kalau status sudah berubah (balapan), jangan timpa & jangan kirim notifikasi.
  const { data: changed, error } = await admin
    .from('tasks')
    // Keluar dari REVIEW (PM membuka kembali): tanggal submit dibersihkan.
    .update({ status: status as TaskStatus, ...(before.status === 'REVIEW' ? { completed_at: null } : {}) })
    .eq('id', id)
    .eq('is_deleted', false)
    .eq('status', before.status)
    .select('id')

  if (error) {
    console.error('changeTaskStatus failed:', error.message)
    return { error: 'Tidak dapat memperbarui status Task.' }
  }
  if (!changed || changed.length === 0) {
    // Klik ganda: permintaan lain sudah menulis status yang sama -> anggap sukses.
    if ((await currentTaskStatus(id)) === status) return { success: 'Status Task diperbarui.' }
    return { error: 'Status Task sudah berubah oleh pengguna lain. Muat ulang halaman lalu coba lagi.' }
  }

  // DONE hanya lewat submitTask (ada email + tanggalnya); jalur ini
  // maksimal sampai status terbuka, jadi selalu emit perubahan biasa.
  if (before.status !== status) {
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
  return { success: 'Status Task berhasil diperbarui.' }
}

/**
 * Tombol submit: catat completed_at (7 Okt 2026). Pengelola project (pemegang
 * tasks.edit) langsung DONE; consultant masuk REVIEW dan PM yang memutuskan
 * lewat decideReview (20 Nov 2026). Idempoten.
 */
export async function submitTask(
  _prev: TaskFormState,
  formData: FormData
): Promise<TaskFormState> {
  const profile = await requireProfile()

  if (profile.role === 'VIEWER') {
    return { error: 'Anda tidak punya izin untuk melakukan aksi ini.' }
  }

  const id = readLimitedField(formData, 'id')
  if (!id) return { error: 'Task tidak ditemukan.' }

  const admin = createAdminClient()
  const { data: task } = await admin
    .from('tasks')
    .select('id, code, title, assignee_id, project_id, status')
    .eq('id', id)
    .eq('is_deleted', false)
    .single<{
      id: string
      code: string
      title: string
      assignee_id: string
      project_id: string
      status: TaskStatus
    }>()

  if (!task) return { error: 'Task tidak ditemukan.' }

  if (!(await canActOnLoadedTask(profile, task))) {
    return { error: 'Anda tidak punya izin untuk melakukan aksi ini.' }
  }

  if (task.status === 'DONE') return { success: 'Task sudah di-submit.' }
  if (task.status === 'CANCELLED') {
    return { error: 'Task yang CANCELLED tidak dapat di-submit.' }
  }

  const target = submitTarget(await hasPermission(profile.id, 'tasks.edit', task.project_id))
  if (task.status === 'REVIEW' && target === 'REVIEW') return { success: 'Task sudah menunggu review PM.' }

  // PM men-submit task yang menunggu review = menyetujui; tanggal submit consultant tetap.
  const patch = task.status === 'REVIEW' ? { status: target } : { status: target, completed_at: new Date().toISOString() }
  // Guard status: kalau status sudah berubah (balapan), jangan timpa & jangan kirim notifikasi.
  const { data: changed, error } = await admin
    .from('tasks')
    .update(patch)
    .eq('id', id)
    .eq('is_deleted', false)
    .eq('status', task.status)
    .select('id')

  if (error) {
    console.error('submitTask failed:', error.message)
    return { error: 'Tidak dapat men-submit Task.' }
  }
  if (!changed || changed.length === 0) {
    // Klik ganda: permintaan lain sudah menutup task dengan status yang sama -> anggap sukses.
    if ((await currentTaskStatus(id)) === target) return { success: 'Task sudah di-submit.' }
    return { error: 'Status Task sudah berubah oleh pengguna lain. Muat ulang halaman lalu coba lagi.' }
  }

  if (target === 'DONE') await notifyTaskDone(id)
  else await emitReviewRequested(id)

  await logActivity({
    actorUserId: profile.id,
    action: 'TASK_STATUS_CHANGED',
    entityType: 'task',
    entityId: id,
    entityCode: task.code,
    projectId: task.project_id,
    metadata: {
      task_code: task.code,
      task_title: task.title,
      old_status: task.status,
      new_status: target,
    },
  })

  revalidatePath('/tasks')
  revalidatePath(`/tasks/${id}`)
  revalidatePath('/projects')
  revalidatePath(`/projects/${task.project_id}`)
  return {
    success: target === 'DONE'
      ? `Task ${task.code} di-submit sebagai Done.`
      : `Task ${task.code} dikirim ke PM untuk direview.`,
  }
}

/**
 * Keputusan PM/Admin (pemegang tasks.edit di project) atas task REVIEW:
 * approve = DONE (tanggal submit consultant tetap); return = kembali
 * IN_PROGRESS, tanggal submit dibersihkan, catatan masuk riwayat aktivitas.
 */
export async function decideReview(
  _prev: TaskFormState,
  formData: FormData
): Promise<TaskFormState> {
  const profile = await requireProfile()
  const id = readLimitedField(formData, 'id')
  const decision = readLimitedField(formData, 'decision')
  const note = readLimitedField(formData, 'note') || null
  if (!id) return { error: 'Task tidak ditemukan.' }
  if (decision !== 'approve' && decision !== 'return') return { error: 'Keputusan tidak valid.' }
  if (note && note.length > 1000) return { error: 'Catatan paling panjang 1000 karakter.' }

  const admin = createAdminClient()
  const { data: task } = await admin
    .from('tasks')
    .select('id, code, title, assignee_id, project_id, status, completed_at')
    .eq('id', id)
    .eq('is_deleted', false)
    .single<{ id: string; code: string; title: string; assignee_id: string; project_id: string; status: TaskStatus; completed_at: string | null }>()
  if (!task) return { error: 'Task tidak ditemukan.' }
  if (!(await hasPermission(profile.id, 'tasks.edit', task.project_id))) {
    return { error: 'Anda tidak punya izin untuk melakukan aksi ini.' }
  }
  if (task.status !== 'REVIEW') return { error: 'Task ini tidak sedang menunggu review. Muat ulang halaman.' }

  const to: TaskStatus = decision === 'approve' ? 'DONE' : 'IN_PROGRESS'
  const patch = decision === 'approve'
    ? { status: to, completed_at: task.completed_at ?? new Date().toISOString() }
    : { status: to, completed_at: null }
  const { data: changed, error } = await admin
    .from('tasks')
    .update(patch)
    .eq('id', id)
    .eq('is_deleted', false)
    .eq('status', 'REVIEW')
    .select('id, updated_at')
  if (error) {
    console.error('decideReview failed:', error.message)
    return { error: 'Tidak dapat menyimpan keputusan review.' }
  }
  if (!changed || changed.length === 0) {
    return { error: 'Status Task sudah berubah oleh pengguna lain. Muat ulang halaman lalu coba lagi.' }
  }

  if (to === 'DONE') {
    await notifyTaskDone(id)
  } else {
    let baseUrl = ''
    try {
      baseUrl = getAppBaseUrl()
    } catch {
      console.error('[notify] APP_URL missing, review-returned email without link.')
    }
    const ctx = await getTaskContext(id)
    // Dikembalikan = consultant harus bertindak: in-app + email (mendesak).
    await emitNotification({
      key: `task-review-returned:${id}:${(changed[0] as { updated_at: string }).updated_at}`,
      type: 'TASK_REVIEW_RETURNED',
      userIds: [task.assignee_id],
      title: `Task ${task.code} dikembalikan PM`,
      message: note ? `Catatan PM: ${note}` : `Oleh ${profile.full_name || profile.email}.`,
      entityType: 'task',
      entityId: id,
      email: {
        subject: `[Dikembalikan] ${task.code} ${task.title}`,
        html: taskReviewBody({ baseUrl, taskId: id, code: task.code, title: task.title, projectLabel: ctx?.projectLabel ?? '-', returned: true, actorName: profile.full_name || profile.email, note: note ?? '' }),
        category: 'task',
      },
    })
  }

  await logActivity({
    actorUserId: profile.id,
    action: 'TASK_STATUS_CHANGED',
    entityType: 'task',
    entityId: id,
    entityCode: task.code,
    projectId: task.project_id,
    metadata: { task_code: task.code, task_title: task.title, old_status: 'REVIEW', new_status: to, note },
  })

  revalidatePath('/tasks')
  revalidatePath(`/tasks/${id}`)
  revalidatePath('/projects')
  revalidatePath(`/projects/${task.project_id}`)
  return {
    success: to === 'DONE' ? `Task ${task.code} disetujui (Done).` : `Task ${task.code} dikembalikan ke consultant.`,
  }
}

/**
 * Consultant men-submit: in-app + email ke PM project (mendesak, perlu
 * keputusan). Project tanpa PM: ke semua Admin aktif supaya tidak tertahan.
 */
async function emitReviewRequested(taskId: string): Promise<void> {
  const ctx = await getTaskContext(taskId)
  if (!ctx) return
  const recipients = await projectDeciders(ctx.task.project_id)
  const { data: assignee } = await createAdminClient()
    .from('profiles')
    .select('full_name, email')
    .eq('id', ctx.task.assignee_id)
    .single<{ full_name: string | null; email: string }>()
  const assigneeName = assignee ? assignee.full_name || assignee.email : '-'
  let baseUrl = ''
  try {
    baseUrl = getAppBaseUrl()
  } catch {
    console.error('[notify] APP_URL missing, review email without link.')
  }
  await emitNotification({
    key: `task-review:${taskId}:${ctx.task.updated_at}`,
    type: 'TASK_REVIEW_REQUESTED',
    userIds: recipients.filter((id) => id !== ctx.task.assignee_id),
    title: `Task ${ctx.task.code} menunggu review Anda`,
    message: `${assigneeName} menyerahkan "${ctx.task.title}" di ${ctx.projectLabel}.`,
    entityType: 'task',
    entityId: taskId,
    email: {
      subject: `[Review PM] ${ctx.task.code} ${ctx.task.title}`,
      html: taskReviewBody({ baseUrl, taskId, code: ctx.task.code, title: ctx.task.title, projectLabel: ctx.projectLabel, returned: false, actorName: assigneeName, note: '' }),
      category: 'task',
    },
  })
}

/**
 * Tombol cancel: tandai CANCELLED + catat cancelled_at (7 Okt 2026).
 * Notifikasi in-app saja (tidak ada email cancel).
 */
export async function cancelTask(
  _prev: TaskFormState,
  formData: FormData
): Promise<TaskFormState> {
  const profile = await requireProfile()

  if (profile.role === 'VIEWER') {
    return { error: 'Anda tidak punya izin untuk melakukan aksi ini.' }
  }

  const id = readLimitedField(formData, 'id')
  if (!id) return { error: 'Task tidak ditemukan.' }

  const admin = createAdminClient()
  const { data: task } = await admin
    .from('tasks')
    .select('id, code, title, assignee_id, project_id, status')
    .eq('id', id)
    .eq('is_deleted', false)
    .single<{
      id: string
      code: string
      title: string
      assignee_id: string
      project_id: string
      status: TaskStatus
    }>()

  if (!task) return { error: 'Task tidak ditemukan.' }

  if (!(await hasPermission(profile.id, 'tasks.cancel', task.project_id))) {
    return { error: 'Hanya PM project atau Admin yang dapat membatalkan task.' }
  }

  if (task.status === 'CANCELLED') return { success: 'Task sudah dibatalkan.' }
  if (task.status === 'DONE') {
    return { error: 'Task yang sudah Done tidak dapat dibatalkan. Minta PM atau Admin untuk membukanya kembali terlebih dahulu.' }
  }

  const now = new Date().toISOString()
  // Guard status: kalau status sudah berubah (balapan), jangan timpa & jangan kirim notifikasi.
  const { data: changed, error } = await admin
    .from('tasks')
    .update({ status: 'CANCELLED', cancelled_at: now })
    .eq('id', id)
    .eq('is_deleted', false)
    .eq('status', task.status)
    .select('id')

  if (error) {
    console.error('cancelTask failed:', error.message)
    return { error: 'Tidak dapat membatalkan Task.' }
  }
  if (!changed || changed.length === 0) {
    // Klik ganda: permintaan lain sudah menutup task dengan status yang sama -> anggap sukses.
    if ((await currentTaskStatus(id)) === 'CANCELLED') return { success: 'Task sudah dibatalkan.' }
    return { error: 'Status Task sudah berubah oleh pengguna lain. Muat ulang halaman lalu coba lagi.' }
  }

  await emitTaskStatusChanged({
    taskId: id,
    taskCode: task.code,
    taskTitle: task.title,
    projectId: task.project_id,
    fromStatus: task.status,
    toStatus: 'CANCELLED',
  })

  await logActivity({
    actorUserId: profile.id,
    action: 'TASK_STATUS_CHANGED',
    entityType: 'task',
    entityId: id,
    entityCode: task.code,
    projectId: task.project_id,
    metadata: {
      task_code: task.code,
      task_title: task.title,
      old_status: task.status,
      new_status: 'CANCELLED',
    },
  })

  revalidatePath('/tasks')
  revalidatePath(`/tasks/${id}`)
  revalidatePath('/projects')
  revalidatePath(`/projects/${task.project_id}`)
  return { success: `Task ${task.code} dibatalkan.` }
}

/**
 * Helper notifikasi task (dipakai create/update/status).
 * Semua lewat unified service — tidak ada email ad-hoc di sini.
 */
async function currentTaskStatus(taskId: string): Promise<string | null> {
  const { data } = await createAdminClient()
    .from('tasks')
    .select('status')
    .eq('id', taskId)
    .maybeSingle<{ status: string }>()
  return data?.status ?? null
}

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
        html: taskBlockedBody({ baseUrl, taskId: input.taskId, code: input.taskCode, title: input.taskTitle, projectLabel: ctx.projectLabel, fromStatus: input.fromStatus }),
        category: 'task',
      }
    }
  }

  await emitNotification({
    // Key mencakup updated_at supaya perubahan berulang tetap terkirim.
    key: `task-status:${input.taskId}:${ctx.task.updated_at}`,
    type: 'TASK_STATUS_CHANGED',
    userIds: [...ctx.managerIds, ...(data ? [data.assignee_id] : [])],
    title: `Task ${input.taskCode} → ${taskStatusLabel(input.toStatus)}`,
    message: `"${input.taskTitle}" berubah dari ${taskStatusLabel(input.fromStatus)} menjadi ${taskStatusLabel(input.toStatus)}.`,
    entityType: 'task',
    entityId: input.taskId,
    email,
  })
}

/**
 * Task menjadi DONE: in-app ke assignee + semua PM. Tanpa email (rutin,
 * kebijakan notifikasi 20 Nov 2026: email hanya untuk yang mendesak).
 * Dijalankan lewat unified service (§52, §69): SATU-SATUNYA mekanisme
 * DONE notification. Gagal kirim tidak menggagalkan update status.
 */
async function notifyTaskDone(taskId: string): Promise<void> {
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

  await emitNotification({
    key: `task-done:${task.id}:${task.updated_at}`,
    type: 'TASK_DONE',
    userIds: [...managerIds, task.assignee_id],
    title: `Task ${task.code} selesai: ${task.title}`,
    message: `${assigneeName} menyelesaikan task ${task.code} di ${projectLabel}.`,
    entityType: 'task',
    entityId: task.id,
    email: null,
  })
}

export async function deleteTask(
  _prev: TaskFormState,
  formData: FormData
): Promise<TaskFormState> {
  const profile = await requirePermission('tasks.delete')

  const id = readLimitedField(formData, 'id')
  if (!id) return { error: 'Task tidak ditemukan.' }

  const scope = await assertCanManageTask(id, profile, 'tasks.delete')
  if (!scope.allowed) {
    return { error: 'Anda tidak punya izin untuk melakukan aksi ini.' }
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
    return { error: 'Tidak dapat menghapus Task.' }
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
  return { success: 'Task berhasil dihapus.' }
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
    return { error: 'Anda tidak punya izin untuk melakukan aksi ini.' }
  }

  const id = readLimitedField(formData, 'id')
  const evidenceUrl = readLimitedField(formData, 'evidence_url')

  if (!id) return { error: 'Task tidak ditemukan.' }
  if (evidenceUrl && !/^https?:\/\/.+/i.test(evidenceUrl)) {
    return { error: 'Evidence harus berupa Link valid yang diawali http(s)://.' }
  }
  if (evidenceUrl.length > 2000) return { error: 'Link Evidence terlalu panjang.' }

  const admin = createAdminClient()
  const { data: task } = await admin
    .from('tasks')
    .select('id, code, title, assignee_id, project_id')
    .eq('id', id)
    .eq('is_deleted', false)
    .single<{ id: string; code: string; title: string; assignee_id: string; project_id: string }>()

  if (!task) return { error: 'Task tidak ditemukan.' }

  if (!(await canActOnLoadedTask(profile, task))) {
    return { error: 'Anda tidak punya izin untuk melakukan aksi ini.' }
  }

  const { error } = await admin
    .from('tasks')
    .update({ evidence_url: evidenceUrl || null })
    .eq('id', id)

  if (error) {
    console.error('submitEvidence failed:', error.message)
    return { error: 'Tidak dapat menyimpan Evidence.' }
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
  return { success: 'Evidence berhasil disimpan.' }
}

/* ------------------------------------------------------------------ */
/* Aksi massal (pilih satu / sebagian / semua, 19 Nov 2026).           */
/* Tiap item lewat aksi satuan di atas: izin, log, notifikasi sama.    */
/* ------------------------------------------------------------------ */

export async function bulkChangeTaskStatus(ids: unknown, input: unknown) {
  const status = readInput(input, 'status')
  return bulk(ids, (id) => changeTaskStatus(undefined, toForm({ id, status })), 'diperbarui')
}

export async function bulkCancelTasks(ids: unknown) {
  return bulk(ids, (id) => cancelTask(undefined, toForm({ id })), 'dibatalkan')
}

/** Ubah satu kolom (prioritas / assignee) lewat updateTask: isian lain diisi nilai task saat ini. */
async function updateTaskField(id: string, patch: { priority?: string; assignee_id?: string }): Promise<TaskFormState> {
  const { data: t } = await createAdminClient()
    .from('tasks')
    .select('title, description, project_id, workstream_id, assignee_id, priority, status, start_date, deadline')
    .eq('id', id)
    .eq('is_deleted', false)
    .maybeSingle<{
      title: string
      description: string | null
      project_id: string
      workstream_id: string | null
      assignee_id: string
      priority: string
      status: string
      start_date: string | null
      deadline: string
    }>()
  if (!t) return { error: 'Task tidak ditemukan.' }
  return updateTask(
    undefined,
    toForm({
      id,
      title: t.title,
      description: t.description,
      project_id: t.project_id,
      workstream_id: t.workstream_id,
      assignee_id: patch.assignee_id ?? t.assignee_id,
      priority: patch.priority ?? t.priority,
      status: t.status,
      start_date: t.start_date,
      deadline: t.deadline,
    })
  )
}

export async function bulkSetTaskPriority(ids: unknown, input: unknown) {
  const priority = readInput(input, 'priority')
  return bulk(ids, (id) => updateTaskField(id, { priority }), 'diperbarui')
}

export async function bulkSetTaskAssignee(ids: unknown, input: unknown) {
  const assigneeId = readInput(input, 'assignee_id')
  return bulk(ids, (id) => updateTaskField(id, { assignee_id: assigneeId }), 'diperbarui')
}
