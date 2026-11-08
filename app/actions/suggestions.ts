'use server'

import { revalidatePath } from 'next/cache'
import { requireProfile } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { isTaskPriority } from '@/lib/auth/roles'
import {
  CLOSED_PROJECT_ERROR,
  canManageProjectFor,
  isProjectClosed,
  isProjectManager,
} from '@/lib/data/projects'
import { canSuggestForProject } from '@/lib/auth/project-access'
import { getAppBaseUrl } from '@/lib/app-url'
import { emitNotification } from '@/lib/notifications/service'
import { emitTaskAssigned } from '@/lib/notifications/task-assigned'
import { logActivity } from '@/lib/activity-log/service'
import { can } from '@/lib/auth/permissions'
import type { SuggestionStatus, TaskSuggestion } from '@/types/suggestion'
import type { TaskPriority } from '@/types/task'
import { escapeEmailHtml as h } from '@/lib/email/layout'
import { readLimitedField } from '@/lib/forms/limits'
import { isValidDateInput } from '@/lib/forms/dates'

export type SuggestionFormState = {
  error?: string
  success?: string
} | undefined

// Batas panjang di server (audit B12), lihat lib/forms/limits.ts.
function readField(formData: FormData, name: string): string {
  return readLimitedField(formData, name)
}

// Tanggal kalender yang benar-benar ada (audit C1).
function validDate(value: string): boolean {
  return isValidDateInput(value)
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


async function assertCanSuggestProject(
  projectId: string,
  userId: string,
  role: string
): Promise<boolean> {
  // Query hanya yang dibutuhkan role-nya; keputusan di canSuggestForProject.
  const managesProject = role === 'PROJECT_MANAGER' && (await isProjectManager(projectId, userId))
  let hasAssignedTask = false
  if (role !== 'ADMIN' && role !== 'PROJECT_MANAGER') {
    const { count } = await createAdminClient()
      .from('tasks')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', projectId)
      .eq('assignee_id', userId)
      .eq('is_deleted', false)
    hasAssignedTask = (count ?? 0) > 0
  }
  return canSuggestForProject(role, { managesProject, hasAssignedTask })
}

/** Cek reviewer berhak atas suggestion ini (admin semua, PM scoped). */
async function assertCanReview(
  suggestion: Pick<TaskSuggestion, 'project_id'>,
  profile: { id: string; role: string }
): Promise<boolean> {
  return canManageProjectFor(profile, suggestion.project_id)
}

export async function createSuggestion(
  _prev: SuggestionFormState,
  formData: FormData
): Promise<SuggestionFormState> {
  const profile = await requireProfile()

  if (!can(profile.role, 'suggestions.create')) {
    return { error: 'Anda tidak punya izin untuk melakukan aksi ini.' }
  }

  const title = readField(formData, 'title')
  const description = readField(formData, 'description')
  const projectId = readField(formData, 'project_id')
  const workstreamId = readField(formData, 'workstream_id')
  const assigneeId = readField(formData, 'suggested_assignee_id')
  const priority = readField(formData, 'suggested_priority')
  const deadline = readField(formData, 'suggested_deadline')

  if (!title) return { error: 'Judul Task wajib diisi.' }
  if (!description) return { error: 'Deskripsi wajib diisi.' }
  if (!projectId) return { error: 'Project wajib diisi.' }
  if (priority && !isTaskPriority(priority)) {
    return { error: 'Pilih prioritas yang valid.' }
  }
  if (!validDate(deadline)) return { error: 'Masukkan Deadline yang valid.' }

  if (!(await assertCanSuggestProject(projectId, profile.id, profile.role))) {
    return { error: 'Anda tidak punya izin untuk melakukan aksi ini.' }
  }
  if (await isProjectClosed(projectId)) return { error: CLOSED_PROJECT_ERROR } // audit B14

  const admin = createAdminClient()

  if (workstreamId) {
    const { data: ws } = await admin
      .from('workstreams')
      .select('id')
      .eq('id', workstreamId)
      .eq('project_id', projectId)
      .maybeSingle<{ id: string }>()
    if (!ws) return { error: 'Workstream bukan milik Project ini.' }
  }

  if (assigneeId && !(await assertActiveUser(assigneeId))) {
    return { error: 'Assignee yang disarankan harus berupa user aktif.' }
  }

  const { data: created, error } = await admin
    .from('task_suggestions')
    .insert({
      title,
      description,
      project_id: projectId,
      workstream_id: workstreamId || null,
      suggested_assignee_id: assigneeId || null,
      suggested_priority: (priority || null) as TaskPriority | null,
      suggested_deadline: deadline || null,
      suggested_by: profile.id,
      status: 'PENDING' as SuggestionStatus,
    })
    .select('id, code')
    .single<{ id: string; code: string }>()

  if (error || !created) {
    console.error('createSuggestion failed:', error?.message)
    return { error: 'Tidak dapat mengirim Suggestion. Silakan coba lagi.' }
  }

  // Event: SUGGESTION_CREATED → semua PM project (in-app + email).
  await notifySuggestionPms({
    id: created.id,
    code: created.code,
    projectId,
    title,
    actorName: profile.full_name || profile.email,
    key: `suggestion-created:${created.id}`,
    resubmitted: false,
  })

  revalidatePath('/task-suggestions')
  revalidatePath('/dashboard')

  await logActivity({
    actorUserId: profile.id,
    action: 'SUGGESTION_CREATED',
    entityType: 'suggestion',
    entityId: created.id,
    entityCode: created.code,
    projectId,
    metadata: { suggestion_code: created.code, suggestion_title: title },
  })

  return { success: `Suggestion ${created.code} berhasil dikirim.` }
}

/** Notifikasi usulan baru / dikirim ulang ke semua PM project (in-app + email). */
async function notifySuggestionPms(input: {
  id: string
  code: string
  projectId: string
  title: string
  actorName: string
  key: string
  resubmitted: boolean
}): Promise<void> {
  const admin = createAdminClient()
  const [{ data: links }, { data: project }] = await Promise.all([
    admin.from('project_managers').select('user_id').eq('project_id', input.projectId),
    admin.from('projects').select('code, name').eq('id', input.projectId).single<{ code: string; name: string }>(),
  ])
  const pmIds = ((links ?? []) as { user_id: string }[]).map((l) => l.user_id)

  let baseUrl = ''
  try {
    baseUrl = getAppBaseUrl()
  } catch {
    console.error('[notify] APP_URL missing, skipping suggestion email.')
  }

  const projectText = project ? `${project.code} · ${project.name}` : 'sebuah Project'
  const verb = input.resubmitted ? 'mengirim ulang Suggestion yang direvisi' : 'mengusulkan task baru'
  const intro = input.resubmitted
    ? 'Usulan task berikut sudah direvisi dan menunggu review Anda lagi:'
    : 'Ada usulan task baru yang menunggu review Anda:'

  await emitNotification({
    key: input.key,
    type: 'SUGGESTION_CREATED',
    userIds: pmIds,
    title: `Suggestion ${input.resubmitted ? 'Revisi' : 'Baru'} ${input.code}: ${input.title}`,
    message: `${input.actorName} ${verb} di ${projectText}.`,
    entityType: 'suggestion',
    entityId: input.id,
    email: baseUrl
      ? {
          subject: `[Suggestion ${input.code}] ${input.title}`,
          html: `<p>Halo,</p><p>${intro}</p><ul><li><strong>${h(input.code)} ${h(input.title)}</strong></li><li><strong>Project:</strong> ${project ? `${h(project.code)} · ${h(project.name)}` : '-'}</li><li><strong>Diusulkan oleh:</strong> ${h(input.actorName)}</li></ul><p>Review di sini:<br><a href="${baseUrl}/task-suggestions/${input.id}">${baseUrl}/task-suggestions/${input.id}</a></p>`,
          category: 'suggestion',
        }
      : null,
  })
}

/** Creator perbaiki lalu resubmit: REVISION_REQUESTED → PENDING. */
export async function resubmitSuggestion(
  _prev: SuggestionFormState,
  formData: FormData
): Promise<SuggestionFormState> {
  const profile = await requireProfile()

  const id = readField(formData, 'id')
  const title = readField(formData, 'title')
  const description = readField(formData, 'description')
  const workstreamId = readField(formData, 'workstream_id')
  const assigneeId = readField(formData, 'suggested_assignee_id')
  const priority = readField(formData, 'suggested_priority')
  const deadline = readField(formData, 'suggested_deadline')

  if (!id) return { error: 'Suggestion tidak ditemukan.' }
  if (!title) return { error: 'Judul Task wajib diisi.' }
  if (!description) return { error: 'Deskripsi wajib diisi.' }
  // Validasi sama dengan createSuggestion (audit B9).
  if (priority && !isTaskPriority(priority)) {
    return { error: 'Pilih prioritas yang valid.' }
  }
  if (!validDate(deadline)) return { error: 'Masukkan Deadline yang valid.' }

  const admin = createAdminClient()
  const { data: current } = await admin
    .from('task_suggestions')
    .select('*')
    .eq('id', id)
    .single<TaskSuggestion>()

  if (!current) return { error: 'Suggestion tidak ditemukan.' }
  if (current.suggested_by !== profile.id) {
    return { error: 'Anda tidak punya izin untuk melakukan aksi ini.' }
  }
  if (current.status !== 'REVISION_REQUESTED') {
    return { error: 'Hanya Suggestion yang diminta revisi yang dapat dikirim ulang.' }
  }

  if (workstreamId) {
    const { data: ws } = await admin
      .from('workstreams')
      .select('id')
      .eq('id', workstreamId)
      .eq('project_id', current.project_id)
      .maybeSingle<{ id: string }>()
    if (!ws) return { error: 'Workstream bukan milik Project ini.' }
  }
  if (assigneeId && !(await assertActiveUser(assigneeId))) {
    return { error: 'Assignee yang disarankan harus berupa user aktif.' }
  }

  const { data: resubmitted, error } = await admin
    .from('task_suggestions')
    .update({
      title,
      description,
      workstream_id: workstreamId || null,
      suggested_assignee_id: assigneeId || null,
      suggested_priority: (priority || null) as TaskPriority | null,
      suggested_deadline: deadline || null,
      status: 'PENDING' as SuggestionStatus,
    })
    .eq('id', id)
    .eq('status', 'REVISION_REQUESTED')
    .select('updated_at')
    .maybeSingle<{ updated_at: string }>()

  if (error || !resubmitted) {
    console.error('resubmitSuggestion failed:', error?.message)
    return { error: 'Tidak dapat mengirim ulang Suggestion.' }
  }

  // PM diberi tahu bahwa usulan menunggu review lagi (audit B9).
  await notifySuggestionPms({
    id,
    code: current.code,
    projectId: current.project_id,
    title,
    actorName: profile.full_name || profile.email,
    key: `suggestion-resubmitted:${id}:${resubmitted.updated_at}`,
    resubmitted: true,
  })

  revalidatePath('/task-suggestions')
  revalidatePath(`/task-suggestions/${id}`)

  await logActivity({
    actorUserId: profile.id,
    action: 'SUGGESTION_UPDATED',
    entityType: 'suggestion',
    entityId: id,
    entityCode: current.code,
    projectId: current.project_id,
    metadata: { suggestion_code: current.code, suggestion_title: title },
  })

  return { success: 'Suggestion berhasil dikirim ulang.' }
}

export async function reviewSuggestion(
  _prev: SuggestionFormState,
  formData: FormData
): Promise<SuggestionFormState> {
  const profile = await requireProfile()

  if (!can(profile.role, 'suggestions.review')) {
    return { error: 'Anda tidak punya izin untuk melakukan aksi ini.' }
  }

  const id = readField(formData, 'id')
  const decision = readField(formData, 'decision') // approve | revise | reject
  const reviewNote = readField(formData, 'review_note')

  if (!id) return { error: 'Suggestion tidak ditemukan.' }
  if (!['approve', 'revise', 'reject'].includes(decision)) {
    return { error: 'Pilih keputusan review yang valid.' }
  }
  if ((decision === 'revise' || decision === 'reject') && !reviewNote) {
    return { error: 'Catatan review wajib diisi untuk keputusan ini.' }
  }

  const admin = createAdminClient()
  const { data: current } = await admin
    .from('task_suggestions')
    .select('*')
    .eq('id', id)
    .single<TaskSuggestion>()

  if (!current) return { error: 'Suggestion tidak ditemukan.' }
  if (!(await assertCanReview(current, profile))) {
    return { error: 'Anda tidak punya izin untuk melakukan aksi ini.' }
  }
  if (current.status !== 'PENDING') {
    return { error: 'Hanya Suggestion PENDING yang dapat direview.' }
  }

  if (decision === 'approve') {
    // Audit B8: prioritas, deadline, dan catatan dari reviewer ikut dipakai.
    const priority = readField(formData, 'priority') || current.suggested_priority || 'MEDIUM'
    const deadline = readField(formData, 'deadline') || current.suggested_deadline || ''
    if (!isTaskPriority(priority)) return { error: 'Pilih prioritas yang valid.' }
    if (!deadline) return { error: 'Tetapkan Deadline untuk menyetujui Suggestion ini.' }
    if (!validDate(deadline)) return { error: 'Masukkan Deadline yang valid.' }
    return approveSuggestionInternal(id, profile.id, readField(formData, 'assignee_id') || null, {
      priority,
      deadline,
      reviewNote,
    })
  }

  const nextStatus = decision === 'revise' ? 'REVISION_REQUESTED' : 'REJECTED'
  const { error } = await admin
    .from('task_suggestions')
    .update({
      status: nextStatus as SuggestionStatus,
      reviewer_id: profile.id,
      review_note: reviewNote,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('status', 'PENDING') // guard race: hanya dari PENDING

  if (error) {
    console.error('reviewSuggestion failed:', error.message)
    return { error: 'Tidak dapat menyimpan review.' }
  }

  await emitReviewEvent(current, nextStatus, profile, reviewNote)

  await logActivity({
    actorUserId: profile.id,
    action:
      nextStatus === 'REJECTED' ? 'SUGGESTION_REJECTED' : 'SUGGESTION_REVISION_REQUESTED',
    entityType: 'suggestion',
    entityId: id,
    entityCode: current.code,
    projectId: current.project_id,
    metadata: {
      suggestion_code: current.code,
      suggestion_title: current.title,
      review_note: reviewNote,
    },
  })

  revalidatePath('/task-suggestions')
  revalidatePath(`/task-suggestions/${id}`)
  revalidatePath('/dashboard')

  return {
    success:
      nextStatus === 'REJECTED'
        ? 'Suggestion ditolak.'
        : 'Revisi berhasil diminta.',
  }
}

/**
 * Approve → buat tepat satu official task → CONVERTED.
 * Idempotent: kalau sudah APPROVED/CONVERTED atau converted_task_id terisi,
 * tidak membuat task kedua — kembalikan hasil yang sudah ada.
 */
async function approveSuggestionInternal(
  suggestionId: string,
  reviewerId: string,
  chosenAssigneeId: string | null,
  review: { priority: TaskPriority; deadline: string; reviewNote: string }
): Promise<SuggestionFormState> {
  const admin = createAdminClient()

  const { data: current } = await admin
    .from('task_suggestions')
    .select('*')
    .eq('id', suggestionId)
    .single<TaskSuggestion>()

  if (!current) return { error: 'Suggestion tidak ditemukan.' }

  // Idempotency guard: sudah pernah di-approve/convert.
  if (current.status === 'CONVERTED' || current.converted_task_id) {
    return { success: 'Suggestion sudah dikonversi menjadi task.' }
  }
  if (current.status !== 'PENDING') {
    return { error: 'Hanya Suggestion PENDING yang dapat disetujui.' }
  }

  // Validasi ulang rule task (assignee bisa saja nonaktif setelah suggest).
  // Reviewer boleh memilih/mengganti assignee langsung di form review.
  const assigneeId = chosenAssigneeId || current.suggested_assignee_id
  if (!assigneeId) {
    return { error: 'Pilih Assignee untuk menyetujui Suggestion ini.' }
  }
  if (!(await assertActiveUser(assigneeId))) {
    return { error: 'Assignee yang dipilih tidak aktif. Pilih yang lain.' }
  }
  if (await isProjectClosed(current.project_id)) return { error: CLOSED_PROJECT_ERROR } // audit B14

  // Buat task dengan guard: hanya jika masih PENDING (atomic-ish).
  const { data: task, error: taskError } = await admin
    .from('tasks')
    .insert({
      title: current.title,
      description: current.description,
      project_id: current.project_id,
      workstream_id: current.workstream_id,
      assignee_id: assigneeId,
      created_by: reviewerId,
      priority: review.priority,
      status: 'TODO',
      start_date: null,
      deadline: review.deadline,
      // Traceability (audit B10): blok "Source" di detail task.
      source_type: 'SUGGESTION',
      source_id: suggestionId,
    })
    .select('id, code, updated_at')
    .single<{ id: string; code: string; updated_at: string }>()

  if (taskError || !task) {
    console.error('approveSuggestion create task failed:', taskError?.message)
    return { error: 'Tidak dapat membuat Task dari Suggestion.' }
  }

  // Tandai CONVERTED hanya jika masih PENDING — kalau ada approve paralel
  // yang menang duluan, hapus task duplikat yang baru dibuat.
  const { data: updated } = await admin
    .from('task_suggestions')
    .update({
      status: 'CONVERTED' as SuggestionStatus,
      reviewer_id: reviewerId,
      reviewed_at: new Date().toISOString(),
      review_note: review.reviewNote || null,
      converted_task_id: task.id,
    })
    .eq('id', suggestionId)
    .eq('status', 'PENDING')
    .select('id')

  if (!updated || updated.length === 0) {
    // Kalah race: bersihkan task yang terlanjur dibuat.
    await admin.from('tasks').update({ is_deleted: true }).eq('id', task.id)
    return { success: 'Suggestion sudah dikonversi menjadi task.' }
  }

  await emitReviewEvent(current, 'APPROVED', { id: reviewerId }, review.reviewNote, task.id)
  // Audit A9: assignee yang dipilih reviewer (bisa beda dari usulan).
  await emitTaskAssigned({
    taskId: task.id,
    taskCode: task.code,
    taskTitle: current.title,
    projectId: current.project_id,
    assigneeId,
    stamp: task.updated_at,
  })

  await logActivity({
    actorUserId: reviewerId,
    action: 'SUGGESTION_APPROVED',
    entityType: 'suggestion',
    entityId: suggestionId,
    entityCode: current.code,
    projectId: current.project_id,
    metadata: { suggestion_code: current.code, suggestion_title: current.title },
  })
  await logActivity({
    actorUserId: reviewerId,
    action: 'SUGGESTION_CONVERTED',
    entityType: 'suggestion',
    entityId: suggestionId,
    entityCode: current.code,
    projectId: current.project_id,
    metadata: {
      suggestion_code: current.code,
      converted_task_id: task.id,
      converted_task_code: task.code,
    },
  })

  revalidatePath('/task-suggestions')
  revalidatePath(`/task-suggestions/${suggestionId}`)
  revalidatePath('/tasks')
  revalidatePath(`/tasks/${task.id}`)
  revalidatePath('/dashboard')

  return { success: `Disetujui. Task ${task.code} berhasil dibuat.` }
}

async function emitReviewEvent(
  suggestion: TaskSuggestion,
  outcome: 'APPROVED' | 'REVISION_REQUESTED' | 'REJECTED',
  reviewer: { id: string; full_name?: string | null; email?: string },
  reviewNote: string,
  convertedTaskId?: string
): Promise<void> {
  const admin = createAdminClient()

  const [{ data: project }] = await Promise.all([
    admin
      .from('projects')
      .select('code, name')
      .eq('id', suggestion.project_id)
      .single<{ code: string; name: string }>(),
  ])

  let baseUrl = ''
  try {
    baseUrl = getAppBaseUrl()
  } catch {
    console.error('[notify] APP_URL missing, skipping suggestion email.')
  }

  const projectLabel = project ? `${project.code} · ${project.name}` : '-'
  const suggestionUrl = baseUrl ? `${baseUrl}/task-suggestions/${suggestion.id}` : ''

  const config = {
    APPROVED: {
      type: 'SUGGESTION_APPROVED' as const,
      title: `Suggestion ${suggestion.code} disetujui`,
      message: `Suggestion Anda "${suggestion.title}" disetujui dan dikonversi menjadi task resmi.`,
      subject: `[Suggestion ${suggestion.code}] Disetujui`,
    },
    REVISION_REQUESTED: {
      type: 'SUGGESTION_REVISION_REQUESTED' as const,
      title: `Suggestion ${suggestion.code} perlu revisi`,
      message: `Reviewer meminta revisi: ${reviewNote}`,
      subject: `[Suggestion ${suggestion.code}] Revisi diminta`,
    },
    REJECTED: {
      type: 'SUGGESTION_REJECTED' as const,
      title: `Suggestion ${suggestion.code} ditolak`,
      message: `Suggestion Anda ditolak. Alasan: ${reviewNote}`,
      subject: `[Suggestion ${suggestion.code}] Ditolak`,
    },
  }[outcome]

  // Event notifikasi ke creator (in-app + email).
  await emitNotification({
    key: `suggestion-${outcome.toLowerCase()}:${suggestion.id}:${suggestion.updated_at}`,
    type: config.type,
    userIds: [suggestion.suggested_by],
    title: config.title,
    message: `${config.message} (Project: ${projectLabel})`,
    entityType: 'suggestion',
    entityId: suggestion.id,
    email: baseUrl
      ? {
          subject: config.subject,
          html: `<p>Halo,</p><p>${h(config.message)}</p><p><strong>Project:</strong> ${h(projectLabel)}</p>${reviewNote ? `<p><strong>Catatan review:</strong> ${h(reviewNote)}</p>` : ''}${convertedTaskId && baseUrl ? `<p>Lihat task:<br><a href="${baseUrl}/tasks/${convertedTaskId}">${baseUrl}/tasks/${convertedTaskId}</a></p>` : ''}<p>Detail suggestion:<br><a href="${suggestionUrl}">${suggestionUrl}</a></p>`,
          category: 'suggestion',
        }
      : null,
  })

  // Event tambahan saat convert: beri tahu creator + PM (in-app). Assignee
  // sudah mendapat TASK_ASSIGNED dari approveSuggestion.
  if (outcome === 'APPROVED' && convertedTaskId) {
    const { data: links } = await admin
      .from('project_managers')
      .select('user_id')
      .eq('project_id', suggestion.project_id)
    const pmIds = ((links ?? []) as { user_id: string }[]).map((l) => l.user_id)

    await emitNotification({
      key: `task-from-suggestion:${convertedTaskId}`,
      type: 'TASK_CREATED_FROM_SUGGESTION',
      userIds: [suggestion.suggested_by, ...pmIds],
      title: `Task baru dari Suggestion ${suggestion.code}`,
      message: `Suggestion "${suggestion.title}" disetujui dan dibuat sebagai task resmi.`,
      entityType: 'task',
      entityId: convertedTaskId,
      email: null, // email sudah dikirim lewat event APPROVED ke creator
    })
  }
}
