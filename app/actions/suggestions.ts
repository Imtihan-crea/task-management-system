'use server'

import { revalidatePath } from 'next/cache'
import { requireProfile } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { isTaskPriority } from '@/lib/auth/roles'
import { isProjectManager } from '@/lib/data/projects'
import { getAppBaseUrl } from '@/lib/app-url'
import { emitNotification } from '@/lib/notifications/service'
import { can } from '@/lib/auth/permissions'
import type { SuggestionStatus, TaskSuggestion } from '@/types/suggestion'
import type { TaskPriority } from '@/types/task'

export type SuggestionFormState = {
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

/** Project yang boleh dipilih creator (existing scope, §9). */
export async function getSuggestableProjects(
  userId: string,
  role: string
): Promise<{ id: string; code: string; name: string }[]> {
  const admin = createAdminClient()

  if (role === 'ADMIN') {
    const { data } = await admin
      .from('projects')
      .select('id, code, name')
      .order('name', { ascending: true })
      .limit(500)
    return (data ?? []) as { id: string; code: string; name: string }[]
  }

  if (role === 'PROJECT_MANAGER') {
    const { data: links } = await admin
      .from('project_managers')
      .select('project_id')
      .eq('user_id', userId)

    const ids = ((links ?? []) as { project_id: string }[]).map((l) => l.project_id)
    if (ids.length === 0) return []

    const { data } = await admin
      .from('projects')
      .select('id, code, name')
      .in('id', ids)
      .order('name', { ascending: true })
    return (data ?? []) as { id: string; code: string; name: string }[]
  }

  // TEAM_MEMBER: project yang dia terlibat (punya task aktif).
  const { data: myTasks } = await admin
    .from('tasks')
    .select('project_id')
    .eq('assignee_id', userId)
    .eq('is_deleted', false)
    .limit(1000)

  const ids = [
    ...new Set(((myTasks ?? []) as { project_id: string }[]).map((t) => t.project_id)),
  ]
  if (ids.length === 0) return []

  const { data } = await admin
    .from('projects')
    .select('id, code, name')
    .in('id', ids)
    .order('name', { ascending: true })
  return (data ?? []) as { id: string; code: string; name: string }[]
}

async function assertCanSuggestProject(
  projectId: string,
  userId: string,
  role: string
): Promise<boolean> {
  if (role === 'ADMIN') return true
  if (role === 'PROJECT_MANAGER') return isProjectManager(projectId, userId)

  const { count } = await createAdminClient()
    .from('tasks')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', projectId)
    .eq('assignee_id', userId)
    .eq('is_deleted', false)

  return (count ?? 0) > 0
}

/** Cek reviewer berhak atas suggestion ini (admin semua, PM scoped). */
async function assertCanReview(
  suggestion: Pick<TaskSuggestion, 'project_id'>,
  profile: { id: string; role: string }
): Promise<boolean> {
  if (profile.role === 'ADMIN') return true
  if (profile.role !== 'PROJECT_MANAGER') return false
  return isProjectManager(suggestion.project_id, profile.id)
}

export async function createSuggestion(
  _prev: SuggestionFormState,
  formData: FormData
): Promise<SuggestionFormState> {
  const profile = await requireProfile()

  if (!can(profile.role, 'suggestions.create')) {
    return { error: 'You do not have permission to perform this action.' }
  }

  const title = readField(formData, 'title')
  const description = readField(formData, 'description')
  const projectId = readField(formData, 'project_id')
  const workstreamId = readField(formData, 'workstream_id')
  const assigneeId = readField(formData, 'suggested_assignee_id')
  const priority = readField(formData, 'suggested_priority')
  const deadline = readField(formData, 'suggested_deadline')

  if (!title) return { error: 'Task title is required.' }
  if (!description) return { error: 'Description is required.' }
  if (!projectId) return { error: 'Project is required.' }
  if (priority && !isTaskPriority(priority)) {
    return { error: 'Please choose a valid priority.' }
  }
  if (!validDate(deadline)) return { error: 'Please enter a valid deadline.' }

  if (!(await assertCanSuggestProject(projectId, profile.id, profile.role))) {
    return { error: 'You do not have permission to perform this action.' }
  }

  const admin = createAdminClient()

  if (workstreamId) {
    const { data: ws } = await admin
      .from('workstreams')
      .select('id')
      .eq('id', workstreamId)
      .eq('project_id', projectId)
      .maybeSingle<{ id: string }>()
    if (!ws) return { error: 'Workstream does not belong to this project.' }
  }

  if (assigneeId && !(await assertActiveUser(assigneeId))) {
    return { error: 'Suggested assignee must be an active user.' }
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
    return { error: 'Unable to submit suggestion. Please try again.' }
  }

  // Event: SUGGESTION_CREATED → semua PM project (in-app + email).
  const { data: links } = await admin
    .from('project_managers')
    .select('user_id')
    .eq('project_id', projectId)
  const pmIds = ((links ?? []) as { user_id: string }[]).map((l) => l.user_id)

  const [{ data: project }] = await Promise.all([
    admin.from('projects').select('code, name').eq('id', projectId).single<{ code: string; name: string }>(),
  ])

  let baseUrl = ''
  try {
    baseUrl = getAppBaseUrl()
  } catch {
    console.error('[notify] APP_URL missing, skipping suggestion email.')
  }

  await emitNotification({
    key: `suggestion-created:${created.id}`,
    type: 'SUGGESTION_CREATED',
    userIds: pmIds,
    title: `New suggestion ${created.code}: ${title}`,
    message: `${profile.full_name || profile.email} suggested a new task in ${project ? `${project.code} · ${project.name}` : 'a project'}.`,
    entityType: 'suggestion',
    entityId: created.id,
    email: baseUrl
      ? {
          subject: `[Suggestion ${created.code}] ${title}`,
          html: `<p>Halo,</p><p>Ada usulan task baru yang menunggu review Anda:</p><ul><li><strong>${created.code} ${title}</strong></li><li><strong>Project:</strong> ${project ? `${project.code} · ${project.name}` : '-'}</li><li><strong>Suggested by:</strong> ${profile.full_name || profile.email}</li></ul><p>Review di sini:<br><a href="${baseUrl}/task-suggestions/${created.id}">${baseUrl}/task-suggestions/${created.id}</a></p>`,
          category: 'suggestion',
        }
      : null,
  })

  revalidatePath('/task-suggestions')
  revalidatePath('/dashboard')
  return { success: `Suggestion ${created.code} submitted successfully.` }
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

  if (!id) return { error: 'Suggestion not found.' }
  if (!title) return { error: 'Task title is required.' }
  if (!description) return { error: 'Description is required.' }

  const admin = createAdminClient()
  const { data: current } = await admin
    .from('task_suggestions')
    .select('*')
    .eq('id', id)
    .single<TaskSuggestion>()

  if (!current) return { error: 'Suggestion not found.' }
  if (current.suggested_by !== profile.id) {
    return { error: 'You do not have permission to perform this action.' }
  }
  if (current.status !== 'REVISION_REQUESTED') {
    return { error: 'Only suggestions requesting revision can be resubmitted.' }
  }

  if (workstreamId) {
    const { data: ws } = await admin
      .from('workstreams')
      .select('id')
      .eq('id', workstreamId)
      .eq('project_id', current.project_id)
      .maybeSingle<{ id: string }>()
    if (!ws) return { error: 'Workstream does not belong to this project.' }
  }
  if (assigneeId && !(await assertActiveUser(assigneeId))) {
    return { error: 'Suggested assignee must be an active user.' }
  }

  const { error } = await admin
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

  if (error) {
    console.error('resubmitSuggestion failed:', error.message)
    return { error: 'Unable to resubmit suggestion.' }
  }

  revalidatePath('/task-suggestions')
  revalidatePath(`/task-suggestions/${id}`)
  return { success: 'Suggestion resubmitted successfully.' }
}

export async function reviewSuggestion(
  _prev: SuggestionFormState,
  formData: FormData
): Promise<SuggestionFormState> {
  const profile = await requireProfile()

  if (!can(profile.role, 'suggestions.review')) {
    return { error: 'You do not have permission to perform this action.' }
  }

  const id = readField(formData, 'id')
  const decision = readField(formData, 'decision') // approve | revise | reject
  const reviewNote = readField(formData, 'review_note')

  if (!id) return { error: 'Suggestion not found.' }
  if (!['approve', 'revise', 'reject'].includes(decision)) {
    return { error: 'Please choose a valid review decision.' }
  }
  if ((decision === 'revise' || decision === 'reject') && !reviewNote) {
    return { error: 'Review note is required for this decision.' }
  }

  const admin = createAdminClient()
  const { data: current } = await admin
    .from('task_suggestions')
    .select('*')
    .eq('id', id)
    .single<TaskSuggestion>()

  if (!current) return { error: 'Suggestion not found.' }
  if (!(await assertCanReview(current, profile))) {
    return { error: 'You do not have permission to perform this action.' }
  }
  if (current.status !== 'PENDING') {
    return { error: 'Only pending suggestions can be reviewed.' }
  }

  if (decision === 'approve') {
    return approveSuggestionInternal(id, profile.id)
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
    return { error: 'Unable to save review.' }
  }

  await emitReviewEvent(current, nextStatus, profile, reviewNote)

  revalidatePath('/task-suggestions')
  revalidatePath(`/task-suggestions/${id}`)
  revalidatePath('/dashboard')

  return {
    success:
      nextStatus === 'REJECTED'
        ? 'Suggestion rejected.'
        : 'Revision requested successfully.',
  }
}

/**
 * Approve → buat tepat satu official task → CONVERTED.
 * Idempotent: kalau sudah APPROVED/CONVERTED atau converted_task_id terisi,
 * tidak membuat task kedua — kembalikan hasil yang sudah ada.
 */
async function approveSuggestionInternal(
  suggestionId: string,
  reviewerId: string
): Promise<SuggestionFormState> {
  const admin = createAdminClient()

  const { data: current } = await admin
    .from('task_suggestions')
    .select('*')
    .eq('id', suggestionId)
    .single<TaskSuggestion>()

  if (!current) return { error: 'Suggestion not found.' }

  // Idempotency guard: sudah pernah di-approve/convert.
  if (current.status === 'CONVERTED' || current.converted_task_id) {
    return { success: 'Suggestion already converted to a task.' }
  }
  if (current.status !== 'PENDING') {
    return { error: 'Only pending suggestions can be approved.' }
  }

  // Validasi ulang rule task (assignee bisa saja nonaktif setelah suggest).
  const assigneeId = current.suggested_assignee_id
  if (assigneeId && !(await assertActiveUser(assigneeId))) {
    return { error: 'Suggested assignee is no longer active. Ask the creator to revise.' }
  }
  if (!assigneeId) {
    return { error: 'Suggestion has no assignee. Ask the creator to revise.' }
  }

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
      priority: (current.suggested_priority ?? 'MEDIUM') as TaskPriority,
      status: 'TODO',
      start_date: null,
      deadline: current.suggested_deadline ?? new Date().toISOString().slice(0, 10),
    })
    .select('id, code')
    .single<{ id: string; code: string }>()

  if (taskError || !task) {
    console.error('approveSuggestion create task failed:', taskError?.message)
    return { error: 'Unable to create task from suggestion.' }
  }

  // Tandai CONVERTED hanya jika masih PENDING — kalau ada approve paralel
  // yang menang duluan, hapus task duplikat yang baru dibuat.
  const { data: updated } = await admin
    .from('task_suggestions')
    .update({
      status: 'CONVERTED' as SuggestionStatus,
      reviewer_id: reviewerId,
      reviewed_at: new Date().toISOString(),
      converted_task_id: task.id,
    })
    .eq('id', suggestionId)
    .eq('status', 'PENDING')
    .select('id')

  if (!updated || updated.length === 0) {
    // Kalah race: bersihkan task yang terlanjur dibuat.
    await admin.from('tasks').update({ is_deleted: true }).eq('id', task.id)
    return { success: 'Suggestion already converted to a task.' }
  }

  await emitReviewEvent(current, 'APPROVED', { id: reviewerId }, '', task.id)

  revalidatePath('/task-suggestions')
  revalidatePath(`/task-suggestions/${suggestionId}`)
  revalidatePath('/tasks')
  revalidatePath(`/tasks/${task.id}`)
  revalidatePath('/dashboard')

  return { success: `Approved. Task ${task.code} created successfully.` }
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
      title: `Suggestion ${suggestion.code} approved`,
      message: `Your suggestion "${suggestion.title}" was approved and converted to an official task.`,
      subject: `[Suggestion ${suggestion.code}] Approved`,
    },
    REVISION_REQUESTED: {
      type: 'SUGGESTION_REVISION_REQUESTED' as const,
      title: `Suggestion ${suggestion.code} needs revision`,
      message: `Reviewer requested revision: ${reviewNote}`,
      subject: `[Suggestion ${suggestion.code}] Revision requested`,
    },
    REJECTED: {
      type: 'SUGGESTION_REJECTED' as const,
      title: `Suggestion ${suggestion.code} rejected`,
      message: `Your suggestion was rejected. Reason: ${reviewNote}`,
      subject: `[Suggestion ${suggestion.code}] Rejected`,
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
          html: `<p>Halo,</p><p>${config.message}</p><p><strong>Project:</strong> ${projectLabel}</p>${reviewNote ? `<p><strong>Review note:</strong> ${reviewNote}</p>` : ''}${convertedTaskId && baseUrl ? `<p>Lihat task:<br><a href="${baseUrl}/tasks/${convertedTaskId}">${baseUrl}/tasks/${convertedTaskId}</a></p>` : ''}<p>Detail suggestion:<br><a href="${suggestionUrl}">${suggestionUrl}</a></p>`,
          category: 'suggestion',
        }
      : null,
  })

  // Event tambahan saat convert: beri tahu assignee + PM (in-app).
  if (outcome === 'APPROVED' && convertedTaskId) {
    const { data: links } = await admin
      .from('project_managers')
      .select('user_id')
      .eq('project_id', suggestion.project_id)
    const pmIds = ((links ?? []) as { user_id: string }[]).map((l) => l.user_id)

    await emitNotification({
      key: `task-from-suggestion:${convertedTaskId}`,
      type: 'TASK_CREATED_FROM_SUGGESTION',
      userIds: [
        ...(suggestion.suggested_assignee_id ? [suggestion.suggested_assignee_id] : []),
        suggestion.suggested_by,
        ...pmIds,
      ],
      title: `New task from suggestion ${suggestion.code}`,
      message: `Suggestion "${suggestion.title}" was approved and created as an official task.`,
      entityType: 'task',
      entityId: convertedTaskId,
      email: null, // email sudah dikirim lewat event APPROVED ke creator
    })
  }
}
