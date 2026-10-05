'use server'

import { revalidatePath } from 'next/cache'
import { requireProfile } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { can } from '@/lib/auth/permissions'
import { isProjectManager } from '@/lib/data/projects'
import { getAppBaseUrl } from '@/lib/app-url'
import { emitNotification } from '@/lib/notifications/service'
import { logActivity } from '@/lib/activity-log/service'
// Nilai enum diimpor dari skema Drizzle (sumber kebenaran) —
// bukan ditulis ulang di sini. File ini server-only ('use server'),
// jadi runtime drizzle tidak akan ikut ke browser.
import { ACTION_ITEM_STATUSES, MEETING_TYPES } from '@/lib/db/schema'
import {
  fetchMeetingActionItems,
  fetchMeetingById,
  fetchMeetingDecisions,
} from '@/lib/data/meetings'
import { buildCompletionEmailBody } from '@/lib/meetings/completion-email'
import type {
  MeetingActionItemStatus,
  MeetingStatus,
  MeetingType,
} from '@/types/meeting'
import type { MeetingAccess } from '@/lib/meetings/rules'
import {
  canCreateTaskFromMeeting,
  canManageMeetingContent,
  canManageMeetingFull,
  isHistoricalMeetingStatus,
} from '@/lib/meetings/rules'
import type { TaskPriority } from '@/types/task'
import type { UserRole } from '@/types/profile'

export type MeetingFormState = {
  error?: string
  success?: string
} | undefined

/* ============================================================================
 * Helper baca form + validasi dasar
 * ========================================================================== */

function readField(formData: FormData, name: string): string {
  const value = formData.get(name)
  return typeof value === 'string' ? value.trim() : ''
}

function readList(formData: FormData, name: string): string[] {
  return formData
    .getAll(name)
    .map((v) => (typeof v === 'string' ? v.trim() : ''))
    .filter(Boolean)
}

function validDate(value: string): boolean {
  if (!value) return true
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value))
}

function validTime(value: string): boolean {
  if (!value) return true
  const m = /^(\d{1,2}):(\d{2})/.exec(value)
  if (!m) return false
  return Number(m[1]) <= 23 && Number(m[2]) <= 59
}

function isMeetingType(value: string): value is MeetingType {
  return (MEETING_TYPES as readonly string[]).includes(value)
}

function isActionItemStatus(value: string): value is MeetingActionItemStatus {
  return (ACTION_ITEM_STATUSES as readonly string[]).includes(value)
}

const ATTENDANCE = ['PENDING', 'ACCEPTED', 'DECLINED', 'ATTENDED'] as const
type Attendance = (typeof ATTENDANCE)[number]

function isAttendance(value: string): value is Attendance {
  return (ATTENDANCE as readonly string[]).includes(value)
}

function isTaskPriority(value: string): value is TaskPriority {
  return value === 'LOW' || value === 'MEDIUM' || value === 'HIGH'
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

/* ============================================================================
 * Akses meeting — satu tempat untuk semua cek otorisasi (§37)
 * ============================================================================
 *
 * Aturan (lihat matrix di lib/auth/permissions.ts):
 * - ADMIN: boleh semua.
 * - VIEWER: hanya baca, tidak pernah kelola (walau jadi organizer).
 * - Owner (organizer ATAU creator): boleh kelola penuh.
 * - PM: boleh kelola meeting project yang ia kelola, atau meeting global
 *   yang ia ikuti sebagai peserta.
 * - TEAM_MEMBER non-owner yang jadi peserta: boleh kelola KONTEN
 *   (agenda/notes/decisions/action items) + buat task, tapi TIDAK boleh
 *   ubah field inti, complete/cancel, atau kelola participants.
 */

type MeetingRow = {
  id: string
  code: string
  title: string
  project_id: string | null
  status: MeetingStatus
  organizer_id: string | null
  created_by: string | null
  meeting_date: string
}

// MeetingAccess + canViewMeeting tinggal di lib/meetings/rules.ts (modul
// murni) karena file 'use server' HANYA boleh mengekspor fungsi async.
// Di sini diimpor ulang tipenya supaya signature tetap jelas.

/** Akses meeting untuk halaman detail (diekspos sebagai server action helper). */
export async function getMeetingAccess(
  meetingId: string,
  userId: string,
  role: UserRole
): Promise<MeetingAccess> {
  const none: MeetingAccess = {
    meeting: null,
    isOwner: false,
    isParticipant: false,
    isProjectPM: false,
  }

  const admin = createAdminClient()
  const { data: meeting } = await admin
    .from('meetings')
    .select('id, code, title, project_id, status, organizer_id, created_by, meeting_date')
    .eq('id', meetingId)
    .maybeSingle<MeetingRow>()

  if (!meeting) return none

  const isOwner = meeting.organizer_id === userId || meeting.created_by === userId

  const [{ data: part }, isProjectPM] = await Promise.all([
    admin
      .from('meeting_participants')
      .select('id')
      .eq('meeting_id', meetingId)
      .eq('user_id', userId)
      .maybeSingle<{ id: string }>(),
    meeting.project_id && role === 'PROJECT_MANAGER'
      ? isProjectManager(meeting.project_id, userId)
      : Promise.resolve(false),
  ])

  return {
    meeting,
    isOwner,
    isParticipant: Boolean(part),
    isProjectPM,
  }
}

function revalidateMeeting(meetingId: string, projectId: string | null): void {
  revalidatePath('/meetings')
  revalidatePath(`/meetings/${meetingId}`)
  revalidatePath('/dashboard')
  if (projectId) revalidatePath(`/projects/${projectId}`)
}

/* ============================================================================
 * Notifikasi meeting — semua lewat unified service (§24, Rule 3)
 * ========================================================================== */

async function participantUserIds(meetingId: string): Promise<string[]> {
  const { data } = await createAdminClient()
    .from('meeting_participants')
    .select('user_id')
    .eq('meeting_id', meetingId)

  return [
    ...new Set(
      ((data ?? []) as { user_id: string | null }[])
        .map((p) => p.user_id)
        .filter((v): v is string => Boolean(v))
    ),
  ]
}

async function notifyMeetingParticipants(input: {
  key: string
  type:
    | 'MEETING_INVITATION'
    | 'MEETING_UPDATED'
    | 'MEETING_CANCELLED'
    | 'MEETING_COMPLETED'
  meetingId: string
  code: string
  title: string
  projectLabel: string
  headline: string
  emailSubject: string
  emailBody: string
  /**
   * Kalau diisi, dipakai sebagai HTML email seutuhnya (menggantikan
   * template default). Dipakai email Completed yang memuat hasil meeting.
   */
  emailHtml?: string
  /**
   * Kalau true, email dilewati (in-app saja). Dipakai untuk edit setelah
   * meeting COMPLETED/CANCELLED — lihat isHistoricalMeetingStatus.
   */
  suppressEmail?: boolean
}): Promise<void> {
  const userIds = await participantUserIds(input.meetingId)
  if (userIds.length === 0) return

  let baseUrl = ''
  try {
    baseUrl = getAppBaseUrl()
  } catch {
    console.error('[notify] APP_URL missing, skipping meeting email.')
  }

  await emitNotification({
    key: input.key,
    type: input.type,
    userIds,
    title: input.headline,
    message: `"${input.title}" (${input.code}) di ${input.projectLabel}.`,
    entityType: 'meeting',
    entityId: input.meetingId,
    email: input.suppressEmail
      ? null
      : baseUrl
        ? {
            subject: input.emailSubject,
            html:
              input.emailHtml ??
              `<p>Halo,</p><p>${input.emailBody}</p><ul><li><strong>${input.code} ${input.title}</strong></li><li><strong>Project:</strong> ${input.projectLabel}</li></ul><p>Lihat detail:<br><a href="${baseUrl}/meetings/${input.meetingId}">${baseUrl}/meetings/${input.meetingId}</a></p>`,
            category: 'meeting',
          }
        : null,
  })
}

/**
 * Notifikasi edit konten (agenda/notes/decisions/action items/participants).
 * Selalu in-app saja, tidak pernah email — edit konten itu granular dan
 * sering, dan setelah COMPLETED/CANCELLED email memang dilarang.
 * Dipakai untuk semua mutasi konten supaya peserta tetap tahu via lonceng.
 */
async function notifyContentChange(input: {
  meetingId: string
  code: string
  title: string
  projectId: string | null
  headline: string
  /** Pembeda key supaya edit berbeda tidak saling men-suppress. */
  keySuffix: string
}): Promise<void> {
  const label = await projectLabel(input.projectId)
  await notifyMeetingParticipants({
    key: `meeting-content:${input.meetingId}:${input.keySuffix}:${Date.now()}`,
    type: 'MEETING_UPDATED',
    meetingId: input.meetingId,
    code: input.code,
    title: input.title,
    projectLabel: label,
    headline: input.headline,
    emailSubject: '',
    emailBody: '',
    suppressEmail: true,
  })
}

async function projectLabel(projectId: string | null): Promise<string> {
  if (!projectId) return 'Global meeting (tanpa project)'
  const { data } = await createAdminClient()
    .from('projects')
    .select('code, name')
    .eq('id', projectId)
    .maybeSingle<{ code: string; name: string }>()
  return data ? `${data.code} · ${data.name}` : '-'
}

/** Scope project saat create: PM hanya project miliknya, member hanya yang ia ikuti. */
export async function assertCanCreateInProject(
  projectId: string,
  userId: string,
  role: UserRole
): Promise<string | null> {
  const admin = createAdminClient()
  const { data: project } = await admin
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .maybeSingle<{ id: string }>()
  if (!project) return 'Project not found.'

  if (role === 'ADMIN') return null
  if (role === 'PROJECT_MANAGER') {
    if (await isProjectManager(projectId, userId)) return null
    return 'You do not have permission to perform this action.'
  }
  // TEAM_MEMBER: project yang ia ikuti (punya task aktif di sana).
  const { data: task } = await admin
    .from('tasks')
    .select('id')
    .eq('project_id', projectId)
    .eq('assignee_id', userId)
    .eq('is_deleted', false)
    .limit(1)
    .maybeSingle<{ id: string }>()
  if (!task) return 'You do not have access to this project.'
  return null
}

function validateMeetingFields(input: {
  title: string
  meetingType: string
  meetingDate: string
  startTime: string
  endTime: string
}): string | null {
  if (!input.title) return 'Meeting title is required.'
  if (!isMeetingType(input.meetingType)) return 'Please choose a valid meeting type.'
  if (!input.meetingDate || !validDate(input.meetingDate)) {
    return 'Please enter a valid date.'
  }
  if (!input.startTime || !validTime(input.startTime)) {
    return 'Please enter a valid start time.'
  }
  if (!input.endTime || !validTime(input.endTime)) {
    return 'Please enter a valid end time.'
  }
  // Bandingkan sebagai menit (format HH:MM tidak bisa dibandingkan string
  // kalau tanpa nol depan, mis. "9:00" > "10:00" secara string).
  const toMin = (v: string) => {
    const m = /^(\d{1,2}):(\d{2})/.exec(v)!
    return Number(m[1]) * 60 + Number(m[2])
  }
  if (toMin(input.endTime) <= toMin(input.startTime)) {
    return 'End time must be after start time.'
  }
  return null
}

/* ============================================================================
 * CREATE + UPDATE + LIFECYCLE
 * ========================================================================== */

export async function createMeeting(
  _prev: MeetingFormState,
  formData: FormData
): Promise<MeetingFormState> {
  const profile = await requireProfile()

  if (!can(profile.role, 'meetings.create')) {
    return { error: 'You do not have permission to perform this action.' }
  }

  const title = readField(formData, 'title')
  const projectId = readField(formData, 'project_id')
  const meetingType = readField(formData, 'meeting_type') || 'INTERNAL_MEETING'
  const meetingDate = readField(formData, 'meeting_date')
  const startTime = readField(formData, 'start_time')
  const endTime = readField(formData, 'end_time')
  const location = readField(formData, 'location')
  const meetingLink = readField(formData, 'meeting_link')
  const description = readField(formData, 'description')
  const organizerId = readField(formData, 'organizer_id') || profile.id
  const addToCalendar = formData.get('add_to_calendar') === 'on'
  const participantIds = [...new Set(readList(formData, 'participant_ids'))]

  const fieldError = validateMeetingFields({
    title,
    meetingType,
    meetingDate,
    startTime,
    endTime,
  })
  if (fieldError) return { error: fieldError }

  if (meetingLink && !/^https?:\/\/.+/i.test(meetingLink)) {
    return { error: 'Meeting link must start with http(s)://.' }
  }

  // Project: kalau diisi (atau terkunci dari ?project=), validasi scope.
  if (projectId) {
    const scopeError = await assertCanCreateInProject(projectId, profile.id, profile.role)
    if (scopeError) return { error: scopeError }
  }

  // Organizer harus user aktif. Member biasa tidak bisa menunjuk orang lain.
  if (!(await assertActiveUser(organizerId))) {
    return { error: 'Organizer must be an active user.' }
  }
  if (profile.role === 'TEAM_MEMBER' && organizerId !== profile.id) {
    return { error: 'You can only organize your own meeting.' }
  }

  // Peserta harus user aktif semua.
  for (const pid of participantIds) {
    if (!(await assertActiveUser(pid))) {
      return { error: 'All participants must be active users.' }
    }
  }

  const admin = createAdminClient()
  const { data: created, error } = await admin
    .from('meetings')
    .insert({
      title,
      project_id: projectId || null,
      meeting_type: meetingType,
      status: 'DRAFT',
      meeting_date: meetingDate,
      start_time: startTime,
      end_time: endTime,
      location: location || null,
      meeting_link: meetingLink || null,
      description: description || null,
      organizer_id: organizerId,
      created_by: profile.id,
      add_to_calendar: addToCalendar,
      // Opsi A: fondasi sync saja. Tanpa koneksi OAuth, status tetap
      // NOT_CONNECTED walau checkbox dicentang — dicatat, tidak gagal.
      google_sync_status: 'NOT_CONNECTED',
    })
    .select('id, code, updated_at')
    .single<{ id: string; code: string; updated_at: string }>()

  if (error || !created) {
    console.error('createMeeting failed:', error?.message)
    return { error: 'Unable to create meeting. Please try again.' }
  }

  // Organizer otomatis jadi peserta (is_organizer). Duplikat diabaikan.
  const allParticipants = [...new Set([organizerId, ...participantIds])]
  const { error: partError } = await admin.from('meeting_participants').insert(
    allParticipants.map((user_id) => ({
      meeting_id: created.id,
      user_id,
      is_organizer: user_id === organizerId,
    }))
  )
  if (partError && partError.code !== '23505') {
    console.error('createMeeting participants failed:', partError.message)
  }

  const label = await projectLabel(projectId || null)
  await notifyMeetingParticipants({
    key: `meeting-invitation:${created.id}:${created.updated_at}`,
    type: 'MEETING_INVITATION',
    meetingId: created.id,
    code: created.code,
    title,
    projectLabel: label,
    headline: `You are invited to ${created.code}: ${title}`,
    emailSubject: `[Meeting Invitation] ${created.code} ${title}`,
    emailBody: 'Anda diundang ke meeting berikut:',
  })

  await logActivity({
    actorUserId: profile.id,
    action: 'MEETING_CREATED',
    entityType: 'meeting',
    entityId: created.id,
    entityCode: created.code,
    projectId: projectId || null,
    metadata: {
      meeting_code: created.code,
      meeting_title: title,
      meeting_type: meetingType,
      meeting_date: meetingDate,
    },
  })

  revalidateMeeting(created.id, projectId || null)
  return { success: `Meeting ${created.code} created successfully.` }
}

export async function updateMeeting(
  _prev: MeetingFormState,
  formData: FormData
): Promise<MeetingFormState> {
  const profile = await requireProfile()

  const id = readField(formData, 'id')
  if (!id) return { error: 'Meeting not found.' }

  const access = await getMeetingAccess(id, profile.id, profile.role)
  if (!access.meeting || !canManageMeetingFull(access, profile.role)) {
    return { error: 'You do not have permission to perform this action.' }
  }

  // COMPLETED/CANCELLED adalah historical record (§13): field inti dikunci.
  // Notes tetap bisa diubah lewat updateNotes.
  if (access.meeting.status === 'COMPLETED' || access.meeting.status === 'CANCELLED') {
    return { error: 'Completed or cancelled meetings cannot be edited.' }
  }

  const title = readField(formData, 'title')
  const meetingType = readField(formData, 'meeting_type')
  const meetingDate = readField(formData, 'meeting_date')
  const startTime = readField(formData, 'start_time')
  const endTime = readField(formData, 'end_time')
  const location = readField(formData, 'location')
  const meetingLink = readField(formData, 'meeting_link')
  const description = readField(formData, 'description')
  // Project TIDAK bisa diubah setelah create (konteks first-class, §3):
  // pindah project akan merusak scope + traceability task.

  const fieldError = validateMeetingFields({
    title,
    meetingType,
    meetingDate,
    startTime,
    endTime,
  })
  if (fieldError) return { error: fieldError }

  if (meetingLink && !/^https?:\/\/.+/i.test(meetingLink)) {
    return { error: 'Meeting link must start with http(s)://.' }
  }

  // Ganti organizer hanya boleh ADMIN/PM. Member tidak bisa mengalihkan
  // meeting miliknya ke orang lain.
  let organizerId = access.meeting.organizer_id
  const wantOrganizer = readField(formData, 'organizer_id')
  if (wantOrganizer && wantOrganizer !== organizerId) {
    if (profile.role !== 'ADMIN' && profile.role !== 'PROJECT_MANAGER') {
      return { error: 'You do not have permission to perform this action.' }
    }
    if (!(await assertActiveUser(wantOrganizer))) {
      return { error: 'Organizer must be an active user.' }
    }
    organizerId = wantOrganizer
  }

  const { data: updated, error } = await createAdminClient()
    .from('meetings')
    .update({
      title,
      meeting_type: meetingType,
      meeting_date: meetingDate,
      start_time: startTime,
      end_time: endTime,
      location: location || null,
      meeting_link: meetingLink || null,
      description: description || null,
      organizer_id: organizerId,
      add_to_calendar: formData.get('add_to_calendar') === 'on',
    })
    .eq('id', id)
    .select('id, code, updated_at')
    .single<{ id: string; code: string; updated_at: string }>()

  if (error || !updated) {
    console.error('updateMeeting failed:', error?.message)
    return { error: 'Unable to update meeting.' }
  }

  const label = await projectLabel(access.meeting.project_id)
  await notifyMeetingParticipants({
    key: `meeting-updated:${id}:${updated.updated_at}`,
    type: 'MEETING_UPDATED',
    meetingId: id,
    code: updated.code,
    title,
    projectLabel: label,
    headline: `Meeting ${updated.code} updated: ${title}`,
    emailSubject: `[Meeting Updated] ${updated.code} ${title}`,
    emailBody: 'Meeting berikut diperbarui:',
  })

  await logActivity({
    actorUserId: profile.id,
    action: 'MEETING_UPDATED',
    entityType: 'meeting',
    entityId: id,
    entityCode: updated.code,
    projectId: access.meeting.project_id,
    metadata: { meeting_code: updated.code, meeting_title: title },
  })

  revalidateMeeting(id, access.meeting.project_id)
  return { success: 'Meeting updated successfully.' }
}

/** DRAFT -> SCHEDULED (§13). */
export async function scheduleMeeting(
  _prev: MeetingFormState,
  formData: FormData
): Promise<MeetingFormState> {
  const profile = await requireProfile()

  const id = readField(formData, 'id')
  if (!id) return { error: 'Meeting not found.' }

  const access = await getMeetingAccess(id, profile.id, profile.role)
  if (!access.meeting || !canManageMeetingFull(access, profile.role)) {
    return { error: 'You do not have permission to perform this action.' }
  }
  if (access.meeting.status !== 'DRAFT') {
    return { error: 'Only draft meetings can be scheduled.' }
  }

  const { data: updated, error } = await createAdminClient()
    .from('meetings')
    .update({ status: 'SCHEDULED' })
    .eq('id', id)
    .eq('status', 'DRAFT')
    .select('id, code, updated_at')
    .maybeSingle<{ id: string; code: string; updated_at: string }>()

  if (error || !updated) {
    console.error('scheduleMeeting failed:', error?.message)
    return { error: 'Unable to schedule meeting.' }
  }

  await logActivity({
    actorUserId: profile.id,
    action: 'MEETING_SCHEDULED',
    entityType: 'meeting',
    entityId: id,
    entityCode: updated.code,
    projectId: access.meeting.project_id,
    metadata: { meeting_code: updated.code, meeting_title: access.meeting.title },
  })

  revalidateMeeting(id, access.meeting.project_id)
  return { success: `Meeting ${updated.code} scheduled successfully.` }
}

/** SCHEDULED -> COMPLETED (§41). Ringkasan post-meeting ditampilkan di UI. */
export async function completeMeeting(
  _prev: MeetingFormState,
  formData: FormData
): Promise<MeetingFormState> {
  const profile = await requireProfile()

  const id = readField(formData, 'id')
  if (!id) return { error: 'Meeting not found.' }

  const access = await getMeetingAccess(id, profile.id, profile.role)
  if (!access.meeting || !canManageMeetingFull(access, profile.role)) {
    return { error: 'You do not have permission to perform this action.' }
  }
  if (access.meeting.status !== 'SCHEDULED') {
    return { error: 'Only scheduled meetings can be completed.' }
  }

  const { data: updated, error } = await createAdminClient()
    .from('meetings')
    .update({ status: 'COMPLETED' })
    .eq('id', id)
    .eq('status', 'SCHEDULED')
    .select('id, code, updated_at')
    .maybeSingle<{ id: string; code: string; updated_at: string }>()

  if (error || !updated) {
    console.error('completeMeeting failed:', error?.message)
    return { error: 'Unable to complete meeting.' }
  }

  const label = await projectLabel(access.meeting.project_id)

  // Hasil meeting untuk body email: notes + decisions + action items.
  // Diambil SETELAH status COMPLETED supaya isinya final saat email dikirim.
  const admin = createAdminClient()
  const [fullMeeting, decisions, actions] = await Promise.all([
    fetchMeetingById(id),
    fetchMeetingDecisions(id),
    fetchMeetingActionItems(id),
  ])

  const assigneeIds = [
    ...new Set(actions.map((a) => a.assignee_id).filter((v): v is string => Boolean(v))),
  ]
  const taskIds = [
    ...new Set(actions.map((a) => a.task_id).filter((v): v is string => Boolean(v))),
  ]
  const [{ data: assignees }, { data: linkedTasks }] = await Promise.all([
    assigneeIds.length > 0
      ? admin.from('profiles').select('id, full_name, email').in('id', assigneeIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string | null; email: string }[] }),
    taskIds.length > 0
      ? admin.from('tasks').select('id, code').in('id', taskIds)
      : Promise.resolve({ data: [] as { id: string; code: string }[] }),
  ])
  const assigneeNames = Object.fromEntries(
    ((assignees ?? []) as { id: string; full_name: string | null; email: string }[]).map((u) => [
      u.id,
      u.full_name || u.email,
    ])
  )
  const taskCodes = Object.fromEntries(
    ((linkedTasks ?? []) as { id: string; code: string }[]).map((t) => [t.id, t.code])
  )

  let baseUrl = ''
  try {
    baseUrl = getAppBaseUrl()
  } catch {
    console.error('[notify] APP_URL missing, skipping meeting email.')
  }

  const completionHtml = buildCompletionEmailBody({
    code: updated.code,
    title: access.meeting.title,
    projectLabel: label,
    meetingUrl: baseUrl ? `${baseUrl}/meetings/${id}` : `/meetings/${id}`,
    notes: fullMeeting?.notes ?? null,
    decisions: decisions.map((d) => ({ decision: d.decision, rationale: d.rationale })),
    actionItems: actions.map((a) => ({
      title: a.title,
      assigneeName: a.assignee_id ? (assigneeNames[a.assignee_id] ?? null) : null,
      deadline: a.deadline,
      status: a.status,
      taskCode: a.task_id ? (taskCodes[a.task_id] ?? null) : null,
    })),
    openActionItems: actions.filter((a) => a.status === 'OPEN' || a.status === 'IN_PROGRESS')
      .length,
  })

  await notifyMeetingParticipants({
    key: `meeting-completed:${id}:${updated.updated_at}`,
    type: 'MEETING_COMPLETED',
    meetingId: id,
    code: updated.code,
    title: access.meeting.title,
    projectLabel: label,
    headline: `Meeting ${updated.code} completed: ${access.meeting.title}`,
    emailSubject: `[Meeting Completed] ${updated.code} ${access.meeting.title}`,
    emailBody: 'Meeting berikut telah selesai.',
    emailHtml: completionHtml,
  })

  await logActivity({
    actorUserId: profile.id,
    action: 'MEETING_COMPLETED',
    entityType: 'meeting',
    entityId: id,
    entityCode: updated.code,
    projectId: access.meeting.project_id,
    metadata: { meeting_code: updated.code, meeting_title: access.meeting.title },
  })

  revalidateMeeting(id, access.meeting.project_id)
  return { success: `Meeting ${updated.code} completed.` }
}

/** DRAFT/SCHEDULED -> CANCELLED. COMPLETED tidak bisa dibatalkan. */
export async function cancelMeeting(
  _prev: MeetingFormState,
  formData: FormData
): Promise<MeetingFormState> {
  const profile = await requireProfile()

  const id = readField(formData, 'id')
  if (!id) return { error: 'Meeting not found.' }

  const access = await getMeetingAccess(id, profile.id, profile.role)
  if (!access.meeting || !canManageMeetingFull(access, profile.role)) {
    return { error: 'You do not have permission to perform this action.' }
  }
  if (access.meeting.status !== 'DRAFT' && access.meeting.status !== 'SCHEDULED') {
    return { error: 'Only draft or scheduled meetings can be cancelled.' }
  }

  const { data: updated, error } = await createAdminClient()
    .from('meetings')
    .update({ status: 'CANCELLED' })
    .eq('id', id)
    .in('status', ['DRAFT', 'SCHEDULED'])
    .select('id, code, updated_at')
    .maybeSingle<{ id: string; code: string; updated_at: string }>()

  if (error || !updated) {
    console.error('cancelMeeting failed:', error?.message)
    return { error: 'Unable to cancel meeting.' }
  }

  const label = await projectLabel(access.meeting.project_id)
  await notifyMeetingParticipants({
    key: `meeting-cancelled:${id}:${updated.updated_at}`,
    type: 'MEETING_CANCELLED',
    meetingId: id,
    code: updated.code,
    title: access.meeting.title,
    projectLabel: label,
    headline: `Meeting ${updated.code} cancelled: ${access.meeting.title}`,
    emailSubject: `[Meeting Cancelled] ${updated.code} ${access.meeting.title}`,
    emailBody: 'Meeting berikut dibatalkan:',
  })

  // Rule 2: pembatalan Kasuat tidak menyentuh Google (belum ada koneksi di
  // Opsi A). Status sync dibiarkan apa adanya supaya Retry tetap bisa jalan.

  await logActivity({
    actorUserId: profile.id,
    action: 'MEETING_CANCELLED',
    entityType: 'meeting',
    entityId: id,
    entityCode: updated.code,
    projectId: access.meeting.project_id,
    metadata: { meeting_code: updated.code, meeting_title: access.meeting.title },
  })

  revalidateMeeting(id, access.meeting.project_id)
  return { success: `Meeting ${updated.code} cancelled.` }
}

/**
 * Simpan notes (§17). Plain text multi-baris (keputusan owner).
 * Sengaja dipisah dari updateMeeting supaya notes tetap bisa diisi
 * SETELAH meeting COMPLETED — itulah gunanya Needs Notes queue.
 */
export async function updateMeetingNotes(
  _prev: MeetingFormState,
  formData: FormData
): Promise<MeetingFormState> {
  const profile = await requireProfile()

  const id = readField(formData, 'id')
  const notes = readField(formData, 'notes')
  if (!id) return { error: 'Meeting not found.' }

  const access = await getMeetingAccess(id, profile.id, profile.role)
  if (!access.meeting || !canManageMeetingContent(access, profile.role)) {
    return { error: 'You do not have permission to perform this action.' }
  }
  if (access.meeting.status === 'CANCELLED') {
    return { error: 'Cancelled meetings cannot be edited.' }
  }

  const { error } = await createAdminClient()
    .from('meetings')
    .update({ notes: notes || null })
    .eq('id', id)

  if (error) {
    console.error('updateMeetingNotes failed:', error.message)
    return { error: 'Unable to save notes.' }
  }

  await logActivity({
    actorUserId: profile.id,
    action: 'MEETING_UPDATED',
    entityType: 'meeting',
    entityId: id,
    entityCode: access.meeting.code,
    projectId: access.meeting.project_id,
    metadata: {
      meeting_code: access.meeting.code,
      notes_updated: true,
      notes_filled: notes.length > 0,
    },
  })

  // Notes: selalu in-app saja (tidak pernah email).
  await notifyContentChange({
    meetingId: id,
    code: access.meeting.code,
    title: access.meeting.title,
    projectId: access.meeting.project_id,
    headline: `Notes updated in ${access.meeting.code}`,
    keySuffix: 'notes',
  })

  revalidateMeeting(id, access.meeting.project_id)
  return { success: 'Notes saved successfully.' }
}

/* ============================================================================
 * AGENDA (§16)
 * ========================================================================== */

export async function createAgenda(
  _prev: MeetingFormState,
  formData: FormData
): Promise<MeetingFormState> {
  const profile = await requireProfile()

  const meetingId = readField(formData, 'meeting_id')
  const title = readField(formData, 'title')
  const notes = readField(formData, 'notes')
  if (!meetingId) return { error: 'Meeting not found.' }
  if (!title) return { error: 'Agenda title is required.' }

  const access = await getMeetingAccess(meetingId, profile.id, profile.role)
  if (!access.meeting || !canManageMeetingContent(access, profile.role)) {
    return { error: 'You do not have permission to perform this action.' }
  }

  const admin = createAdminClient()
  const { data: existing } = await admin
    .from('meeting_agendas')
    .select('position')
    .eq('meeting_id', meetingId)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle<{ position: number }>()

  const { error } = await admin.from('meeting_agendas').insert({
    meeting_id: meetingId,
    position: (existing?.position ?? -1) + 1,
    title,
    notes: notes || null,
  })

  if (error) {
    console.error('createAgenda failed:', error.message)
    return { error: 'Unable to add agenda.' }
  }

  await logActivity({
    actorUserId: profile.id,
    action: 'MEETING_AGENDA_UPDATED',
    entityType: 'meeting',
    entityId: meetingId,
    entityCode: access.meeting.code,
    projectId: access.meeting.project_id,
    metadata: { meeting_code: access.meeting.code, change: 'agenda_added', agenda_title: title },
  })

  await notifyContentChange({
    meetingId,
    code: access.meeting.code,
    title: access.meeting.title,
    projectId: access.meeting.project_id,
    headline: `Agenda added in ${access.meeting.code}`,
    keySuffix: 'agenda-added',
  })

  revalidateMeeting(meetingId, access.meeting.project_id)
  return { success: 'Agenda added successfully.' }
}

export async function updateAgenda(
  _prev: MeetingFormState,
  formData: FormData
): Promise<MeetingFormState> {
  const profile = await requireProfile()

  const id = readField(formData, 'id')
  const meetingId = readField(formData, 'meeting_id')
  const title = readField(formData, 'title')
  const notes = readField(formData, 'notes')
  if (!id || !meetingId) return { error: 'Agenda not found.' }
  if (!title) return { error: 'Agenda title is required.' }

  const access = await getMeetingAccess(meetingId, profile.id, profile.role)
  if (!access.meeting || !canManageMeetingContent(access, profile.role)) {
    return { error: 'You do not have permission to perform this action.' }
  }

  const { error } = await createAdminClient()
    .from('meeting_agendas')
    .update({ title, notes: notes || null })
    .eq('id', id)
    .eq('meeting_id', meetingId)

  if (error) {
    console.error('updateAgenda failed:', error.message)
    return { error: 'Unable to update agenda.' }
  }

  await notifyContentChange({
    meetingId,
    code: access.meeting.code,
    title: access.meeting.title,
    projectId: access.meeting.project_id,
    headline: `Agenda updated in ${access.meeting.code}`,
    keySuffix: `agenda-${id}`,
  })

  revalidateMeeting(meetingId, access.meeting.project_id)
  return { success: 'Agenda updated successfully.' }
}

export async function deleteAgenda(
  _prev: MeetingFormState,
  formData: FormData
): Promise<MeetingFormState> {
  const profile = await requireProfile()

  const id = readField(formData, 'id')
  const meetingId = readField(formData, 'meeting_id')
  if (!id || !meetingId) return { error: 'Agenda not found.' }

  const access = await getMeetingAccess(meetingId, profile.id, profile.role)
  if (!access.meeting || !canManageMeetingContent(access, profile.role)) {
    return { error: 'You do not have permission to perform this action.' }
  }

  const { error } = await createAdminClient()
    .from('meeting_agendas')
    .delete()
    .eq('id', id)
    .eq('meeting_id', meetingId)

  if (error) {
    console.error('deleteAgenda failed:', error.message)
    return { error: 'Unable to delete agenda.' }
  }

  await notifyContentChange({
    meetingId,
    code: access.meeting.code,
    title: access.meeting.title,
    projectId: access.meeting.project_id,
    headline: `Agenda removed in ${access.meeting.code}`,
    keySuffix: `agenda-del-${id}`,
  })

  revalidateMeeting(meetingId, access.meeting.project_id)
  return { success: 'Agenda deleted successfully.' }
}

/** Reorder: terima daftar id berurutan, tulis ulang position 0..n. */
export async function reorderAgendas(
  _prev: MeetingFormState,
  formData: FormData
): Promise<MeetingFormState> {
  const profile = await requireProfile()

  const meetingId = readField(formData, 'meeting_id')
  const orderedIds = readList(formData, 'ordered_ids')
  if (!meetingId || orderedIds.length === 0) return { error: 'Nothing to reorder.' }

  const access = await getMeetingAccess(meetingId, profile.id, profile.role)
  if (!access.meeting || !canManageMeetingContent(access, profile.role)) {
    return { error: 'You do not have permission to perform this action.' }
  }

  const admin = createAdminClient()
  const { data: rows } = await admin
    .from('meeting_agendas')
    .select('id')
    .eq('meeting_id', meetingId)
  const validIds = new Set(((rows ?? []) as { id: string }[]).map((r) => r.id))
  if (!orderedIds.every((v) => validIds.has(v)) || orderedIds.length !== validIds.size) {
    return { error: 'Invalid agenda order.' }
  }

  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await admin
      .from('meeting_agendas')
      .update({ position: i })
      .eq('id', orderedIds[i])
      .eq('meeting_id', meetingId)
    if (error) {
      console.error('reorderAgendas failed:', error.message)
      return { error: 'Unable to reorder agenda.' }
    }
  }

  await notifyContentChange({
    meetingId,
    code: access.meeting.code,
    title: access.meeting.title,
    projectId: access.meeting.project_id,
    headline: `Agenda reordered in ${access.meeting.code}`,
    keySuffix: 'agenda-reorder',
  })

  revalidateMeeting(meetingId, access.meeting.project_id)
  return { success: 'Agenda order saved successfully.' }
}

/* ============================================================================
 * DECISIONS (§18)
 * ========================================================================== */

export async function createDecision(
  _prev: MeetingFormState,
  formData: FormData
): Promise<MeetingFormState> {
  const profile = await requireProfile()

  const meetingId = readField(formData, 'meeting_id')
  const decision = readField(formData, 'decision')
  const rationale = readField(formData, 'rationale')
  if (!meetingId) return { error: 'Meeting not found.' }
  if (!decision) return { error: 'Decision is required.' }

  const access = await getMeetingAccess(meetingId, profile.id, profile.role)
  if (!access.meeting || !canManageMeetingContent(access, profile.role)) {
    return { error: 'You do not have permission to perform this action.' }
  }

  const admin = createAdminClient()
  const { data: existing } = await admin
    .from('meeting_decisions')
    .select('position')
    .eq('meeting_id', meetingId)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle<{ position: number }>()

  const { error } = await admin.from('meeting_decisions').insert({
    meeting_id: meetingId,
    position: (existing?.position ?? -1) + 1,
    decision,
    rationale: rationale || null,
    decided_by: profile.id,
  })

  if (error) {
    console.error('createDecision failed:', error.message)
    return { error: 'Unable to add decision.' }
  }

  await logActivity({
    actorUserId: profile.id,
    action: 'MEETING_DECISION_CREATED',
    entityType: 'meeting',
    entityId: meetingId,
    entityCode: access.meeting.code,
    projectId: access.meeting.project_id,
    metadata: { meeting_code: access.meeting.code, decision },
  })

  await notifyContentChange({
    meetingId,
    code: access.meeting.code,
    title: access.meeting.title,
    projectId: access.meeting.project_id,
    headline: `Decision added in ${access.meeting.code}`,
    keySuffix: 'decision-added',
  })

  revalidateMeeting(meetingId, access.meeting.project_id)
  return { success: 'Decision added successfully.' }
}

export async function updateDecision(
  _prev: MeetingFormState,
  formData: FormData
): Promise<MeetingFormState> {
  const profile = await requireProfile()

  const id = readField(formData, 'id')
  const meetingId = readField(formData, 'meeting_id')
  const decision = readField(formData, 'decision')
  const rationale = readField(formData, 'rationale')
  if (!id || !meetingId) return { error: 'Decision not found.' }
  if (!decision) return { error: 'Decision is required.' }

  const access = await getMeetingAccess(meetingId, profile.id, profile.role)
  if (!access.meeting || !canManageMeetingContent(access, profile.role)) {
    return { error: 'You do not have permission to perform this action.' }
  }

  const { error } = await createAdminClient()
    .from('meeting_decisions')
    .update({ decision, rationale: rationale || null })
    .eq('id', id)
    .eq('meeting_id', meetingId)

  if (error) {
    console.error('updateDecision failed:', error.message)
    return { error: 'Unable to update decision.' }
  }

  await notifyContentChange({
    meetingId,
    code: access.meeting.code,
    title: access.meeting.title,
    projectId: access.meeting.project_id,
    headline: `Decision updated in ${access.meeting.code}`,
    keySuffix: `decision-${id}`,
  })

  revalidateMeeting(meetingId, access.meeting.project_id)
  return { success: 'Decision updated successfully.' }
}

export async function deleteDecision(
  _prev: MeetingFormState,
  formData: FormData
): Promise<MeetingFormState> {
  const profile = await requireProfile()

  const id = readField(formData, 'id')
  const meetingId = readField(formData, 'meeting_id')
  if (!id || !meetingId) return { error: 'Decision not found.' }

  const access = await getMeetingAccess(meetingId, profile.id, profile.role)
  if (!access.meeting || !canManageMeetingContent(access, profile.role)) {
    return { error: 'You do not have permission to perform this action.' }
  }

  const { error } = await createAdminClient()
    .from('meeting_decisions')
    .delete()
    .eq('id', id)
    .eq('meeting_id', meetingId)

  if (error) {
    console.error('deleteDecision failed:', error.message)
    return { error: 'Unable to delete decision.' }
  }

  await notifyContentChange({
    meetingId,
    code: access.meeting.code,
    title: access.meeting.title,
    projectId: access.meeting.project_id,
    headline: `Decision removed in ${access.meeting.code}`,
    keySuffix: `decision-del-${id}`,
  })

  revalidateMeeting(meetingId, access.meeting.project_id)
  return { success: 'Decision deleted successfully.' }
}

/* ============================================================================
 * ACTION ITEMS (§19)
 * ========================================================================== */

export async function createActionItem(
  _prev: MeetingFormState,
  formData: FormData
): Promise<MeetingFormState> {
  const profile = await requireProfile()

  const meetingId = readField(formData, 'meeting_id')
  const title = readField(formData, 'title')
  const description = readField(formData, 'description')
  const assigneeId = readField(formData, 'assignee_id')
  const deadline = readField(formData, 'deadline')
  const priority = readField(formData, 'priority') || 'MEDIUM'
  if (!meetingId) return { error: 'Meeting not found.' }
  if (!title) return { error: 'Action item title is required.' }
  if (priority !== '' && !isTaskPriority(priority)) {
    return { error: 'Please choose a valid priority.' }
  }
  if (deadline && !validDate(deadline)) return { error: 'Please enter a valid deadline.' }

  const access = await getMeetingAccess(meetingId, profile.id, profile.role)
  if (!access.meeting || !canManageMeetingContent(access, profile.role)) {
    return { error: 'You do not have permission to perform this action.' }
  }

  if (assigneeId && !(await assertActiveUser(assigneeId))) {
    return { error: 'Assignee must be an active user.' }
  }

  const { error } = await createAdminClient().from('meeting_action_items').insert({
    meeting_id: meetingId,
    title,
    description: description || null,
    assignee_id: assigneeId || null,
    deadline: deadline || null,
    priority,
    status: 'OPEN',
    created_by: profile.id,
  })

  if (error) {
    console.error('createActionItem failed:', error.message)
    return { error: 'Unable to add action item.' }
  }

  await logActivity({
    actorUserId: profile.id,
    action: 'MEETING_ACTION_ITEM_CREATED',
    entityType: 'meeting',
    entityId: meetingId,
    entityCode: access.meeting.code,
    projectId: access.meeting.project_id,
    metadata: { meeting_code: access.meeting.code, action_item_title: title },
  })

  await notifyContentChange({
    meetingId,
    code: access.meeting.code,
    title: access.meeting.title,
    projectId: access.meeting.project_id,
    headline: `Action item added in ${access.meeting.code}`,
    keySuffix: 'action-added',
  })

  revalidateMeeting(meetingId, access.meeting.project_id)
  return { success: 'Action item added successfully.' }
}

export async function updateActionItem(
  _prev: MeetingFormState,
  formData: FormData
): Promise<MeetingFormState> {
  const profile = await requireProfile()

  const id = readField(formData, 'id')
  const meetingId = readField(formData, 'meeting_id')
  const title = readField(formData, 'title')
  const description = readField(formData, 'description')
  const assigneeId = readField(formData, 'assignee_id')
  const deadline = readField(formData, 'deadline')
  const priority = readField(formData, 'priority')
  const status = readField(formData, 'status')
  if (!id || !meetingId) return { error: 'Action item not found.' }
  if (!title) return { error: 'Action item title is required.' }
  if (priority && !isTaskPriority(priority)) {
    return { error: 'Please choose a valid priority.' }
  }
  if (!isActionItemStatus(status)) return { error: 'Please choose a valid status.' }
  if (deadline && !validDate(deadline)) return { error: 'Please enter a valid deadline.' }

  const access = await getMeetingAccess(meetingId, profile.id, profile.role)
  if (!access.meeting || !canManageMeetingContent(access, profile.role)) {
    return { error: 'You do not have permission to perform this action.' }
  }

  if (assigneeId && !(await assertActiveUser(assigneeId))) {
    return { error: 'Assignee must be an active user.' }
  }

  const { error } = await createAdminClient()
    .from('meeting_action_items')
    .update({
      title,
      description: description || null,
      assignee_id: assigneeId || null,
      deadline: deadline || null,
      priority: priority || null,
      status,
    })
    .eq('id', id)
    .eq('meeting_id', meetingId)

  if (error) {
    console.error('updateActionItem failed:', error.message)
    return { error: 'Unable to update action item.' }
  }

  await logActivity({
    actorUserId: profile.id,
    action: 'MEETING_ACTION_ITEM_UPDATED',
    entityType: 'meeting',
    entityId: meetingId,
    entityCode: access.meeting.code,
    projectId: access.meeting.project_id,
    metadata: {
      meeting_code: access.meeting.code,
      action_item_title: title,
      new_status: status,
    },
  })

  await notifyContentChange({
    meetingId,
    code: access.meeting.code,
    title: access.meeting.title,
    projectId: access.meeting.project_id,
    headline: `Action item updated in ${access.meeting.code}`,
    keySuffix: `action-${id}`,
  })

  revalidateMeeting(meetingId, access.meeting.project_id)
  return { success: 'Action item updated successfully.' }
}

export async function deleteActionItem(
  _prev: MeetingFormState,
  formData: FormData
): Promise<MeetingFormState> {
  const profile = await requireProfile()

  const id = readField(formData, 'id')
  const meetingId = readField(formData, 'meeting_id')
  if (!id || !meetingId) return { error: 'Action item not found.' }

  const access = await getMeetingAccess(meetingId, profile.id, profile.role)
  if (!access.meeting || !canManageMeetingContent(access, profile.role)) {
    return { error: 'You do not have permission to perform this action.' }
  }

  // Traceability (§21): action item yang sudah jadi task tidak boleh
  // dihapus — link Meeting -> T-081 harus tetap ada.
  const { data: current } = await createAdminClient()
    .from('meeting_action_items')
    .select('id, task_id')
    .eq('id', id)
    .eq('meeting_id', meetingId)
    .maybeSingle<{ id: string; task_id: string | null }>()

  if (!current) return { error: 'Action item not found.' }
  if (current.task_id) {
    return { error: 'This action item already has a task and cannot be deleted.' }
  }

  const { error } = await createAdminClient()
    .from('meeting_action_items')
    .delete()
    .eq('id', id)
    .eq('meeting_id', meetingId)

  if (error) {
    console.error('deleteActionItem failed:', error.message)
    return { error: 'Unable to delete action item.' }
  }

  await notifyContentChange({
    meetingId,
    code: access.meeting.code,
    title: access.meeting.title,
    projectId: access.meeting.project_id,
    headline: `Action item removed in ${access.meeting.code}`,
    keySuffix: `action-del-${id}`,
  })

  revalidateMeeting(meetingId, access.meeting.project_id)
  return { success: 'Action item deleted successfully.' }
}

/* ============================================================================
 * PARTICIPANTS (§39)
 * ========================================================================== */

export async function addParticipant(
  _prev: MeetingFormState,
  formData: FormData
): Promise<MeetingFormState> {
  const profile = await requireProfile()

  const meetingId = readField(formData, 'meeting_id')
  const userId = readField(formData, 'user_id')
  const externalName = readField(formData, 'external_name')
  const externalEmail = readField(formData, 'external_email')
  if (!meetingId) return { error: 'Meeting not found.' }

  const access = await getMeetingAccess(meetingId, profile.id, profile.role)
  if (!access.meeting || !canManageMeetingFull(access, profile.role)) {
    return { error: 'You do not have permission to perform this action.' }
  }

  // Internal XOR eksternal (sama seperti CHECK di DB).
  const hasInternal = Boolean(userId)
  const hasExternal = Boolean(externalName && externalEmail)
  if (hasInternal === hasExternal) {
    return { error: 'Add either a Kasuat user or an external participant.' }
  }

  const admin = createAdminClient()

  if (hasInternal) {
    if (!(await assertActiveUser(userId))) {
      return { error: 'Participant must be an active user.' }
    }
    const { error } = await admin.from('meeting_participants').insert({
      meeting_id: meetingId,
      user_id: userId,
    })
    if (error) {
      if (error.code === '23505') return { error: 'User is already a participant.' }
      console.error('addParticipant failed:', error.message)
      return { error: 'Unable to add participant.' }
    }

    const { data: added } = await admin
      .from('meeting_participants')
      .select('id')
      .eq('meeting_id', meetingId)
      .eq('user_id', userId)
      .maybeSingle<{ id: string }>()

    // Undang yang baru ditambahkan (key mencakup user supaya tidak bentrok
    // dengan undangan massal saat create). Setelah COMPLETED/CANCELLED,
    // undangan hanya in-app (tanpa email).
    if (added) {
      const historical = isHistoricalMeetingStatus(access.meeting.status)
      const label = await projectLabel(access.meeting.project_id)
      let baseUrl = ''
      try {
        baseUrl = getAppBaseUrl()
      } catch {
        console.error('[notify] APP_URL missing, skipping meeting email.')
      }
      await emitNotification({
        key: `meeting-invitation:${meetingId}:${userId}:${Date.now()}`,
        type: 'MEETING_INVITATION',
        userIds: [userId],
        title: `You are invited to ${access.meeting.code}: ${access.meeting.title}`,
        message: `"${access.meeting.title}" (${access.meeting.code}) di ${label}.`,
        entityType: 'meeting',
        entityId: meetingId,
        email:
          !historical && baseUrl
            ? {
                subject: `[Meeting Invitation] ${access.meeting.code} ${access.meeting.title}`,
                html: `<p>Halo,</p><p>Anda diundang ke meeting berikut:</p><ul><li><strong>${access.meeting.code} ${access.meeting.title}</strong></li><li><strong>Project:</strong> ${label}</li></ul><p>Lihat detail:<br><a href="${baseUrl}/meetings/${meetingId}">${baseUrl}/meetings/${meetingId}</a></p>`,
                category: 'meeting',
              }
            : null,
      })
    }
  } else {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(externalEmail)) {
      return { error: 'Please enter a valid external email.' }
    }
    const { error } = await admin.from('meeting_participants').insert({
      meeting_id: meetingId,
      external_name: externalName,
      external_email: externalEmail,
    })
    if (error) {
      console.error('addParticipant (external) failed:', error.message)
      return { error: 'Unable to add participant.' }
    }
  }

  await logActivity({
    actorUserId: profile.id,
    action: 'MEETING_PARTICIPANT_ADDED',
    entityType: 'meeting',
    entityId: meetingId,
    entityCode: access.meeting.code,
    projectId: access.meeting.project_id,
    metadata: {
      meeting_code: access.meeting.code,
      added_user_id: userId || null,
      added_external: hasExternal ? externalEmail : null,
    },
  })

  revalidateMeeting(meetingId, access.meeting.project_id)
  return { success: 'Participant added successfully.' }
}

export async function removeParticipant(
  _prev: MeetingFormState,
  formData: FormData
): Promise<MeetingFormState> {
  const profile = await requireProfile()

  const meetingId = readField(formData, 'meeting_id')
  const participantId = readField(formData, 'participant_id')
  if (!meetingId || !participantId) return { error: 'Participant not found.' }

  const access = await getMeetingAccess(meetingId, profile.id, profile.role)
  if (!access.meeting || !canManageMeetingFull(access, profile.role)) {
    return { error: 'You do not have permission to perform this action.' }
  }

  const admin = createAdminClient()
  const { data: row } = await admin
    .from('meeting_participants')
    .select('id, user_id')
    .eq('id', participantId)
    .eq('meeting_id', meetingId)
    .maybeSingle<{ id: string; user_id: string | null }>()

  if (!row) return { error: 'Participant not found.' }

  // Organizer meeting tidak bisa dihapus dari daftar peserta — ganti dulu
  // organizer-nya lewat Edit Meeting kalau memang perlu.
  if (row.user_id && row.user_id === access.meeting.organizer_id) {
    return { error: 'The organizer cannot be removed. Change the organizer first.' }
  }

  const { error } = await admin
    .from('meeting_participants')
    .delete()
    .eq('id', participantId)
    .eq('meeting_id', meetingId)

  if (error) {
    console.error('removeParticipant failed:', error.message)
    return { error: 'Unable to remove participant.' }
  }

  await logActivity({
    actorUserId: profile.id,
    action: 'MEETING_PARTICIPANT_REMOVED',
    entityType: 'meeting',
    entityId: meetingId,
    entityCode: access.meeting.code,
    projectId: access.meeting.project_id,
    metadata: { meeting_code: access.meeting.code, removed_user_id: row.user_id },
  })

  await notifyContentChange({
    meetingId,
    code: access.meeting.code,
    title: access.meeting.title,
    projectId: access.meeting.project_id,
    headline: `Participant removed in ${access.meeting.code}`,
    keySuffix: `participant-del-${participantId}`,
  })

  revalidateMeeting(meetingId, access.meeting.project_id)
  return { success: 'Participant removed successfully.' }
}

/** Peserta mengubah kehadirannya sendiri; pengelola boleh mengubah siapa pun. */
export async function updateAttendance(
  _prev: MeetingFormState,
  formData: FormData
): Promise<MeetingFormState> {
  const profile = await requireProfile()

  const meetingId = readField(formData, 'meeting_id')
  const participantId = readField(formData, 'participant_id')
  const attendance = readField(formData, 'attendance')
  if (!meetingId || !participantId) return { error: 'Participant not found.' }
  if (!isAttendance(attendance)) return { error: 'Please choose a valid attendance.' }

  const access = await getMeetingAccess(meetingId, profile.id, profile.role)
  if (!access.meeting) return { error: 'Meeting not found.' }

  const admin = createAdminClient()
  const { data: row } = await admin
    .from('meeting_participants')
    .select('id, user_id')
    .eq('id', participantId)
    .eq('meeting_id', meetingId)
    .maybeSingle<{ id: string; user_id: string | null }>()

  if (!row) return { error: 'Participant not found.' }

  const isOwn = row.user_id === profile.id
  if (!isOwn && !canManageMeetingFull(access, profile.role)) {
    return { error: 'You do not have permission to perform this action.' }
  }

  const { error } = await admin
    .from('meeting_participants')
    .update({ attendance })
    .eq('id', participantId)
    .eq('meeting_id', meetingId)

  if (error) {
    console.error('updateAttendance failed:', error.message)
    return { error: 'Unable to update attendance.' }
  }

  await notifyContentChange({
    meetingId,
    code: access.meeting.code,
    title: access.meeting.title,
    projectId: access.meeting.project_id,
    headline: `Attendance updated in ${access.meeting.code}`,
    keySuffix: `attendance-${participantId}`,
  })

  revalidateMeeting(meetingId, access.meeting.project_id)
  return { success: 'Attendance updated successfully.' }
}

/* ============================================================================
 * ACTION ITEM -> TASK (§20, §21, §22) — core feature
 * ============================================================================
 *
 * Mengikuti persis pola approveSuggestionInternal() di
 * app/actions/suggestions.ts: guard -> insert -> claim atomik
 * (.eq task_id IS NULL di UPDATE) -> kalah race berarti bersihkan duplikat.
 */

type ActionItemFull = {
  id: string
  meeting_id: string
  title: string
  description: string | null
  assignee_id: string | null
  deadline: string | null
  priority: string | null
  status: string
  task_id: string | null
}

export async function createTaskFromActionItem(
  _prev: MeetingFormState,
  formData: FormData
): Promise<MeetingFormState> {
  const profile = await requireProfile()

  const actionItemId = readField(formData, 'action_item_id')
  const meetingId = readField(formData, 'meeting_id')
  if (!actionItemId || !meetingId) return { error: 'Action item not found.' }

  const access = await getMeetingAccess(meetingId, profile.id, profile.role)
  if (!access.meeting || !canCreateTaskFromMeeting(access, profile.role)) {
    return { error: 'You do not have permission to perform this action.' }
  }

  const admin = createAdminClient()
  const { data: action } = await admin
    .from('meeting_action_items')
    .select('id, meeting_id, title, description, assignee_id, deadline, priority, status, task_id')
    .eq('id', actionItemId)
    .eq('meeting_id', meetingId)
    .maybeSingle<ActionItemFull>()

  if (!action) return { error: 'Action item not found.' }

  // §22 idempotency guard: task sudah ada -> jangan buat lagi.
  if (action.task_id) {
    const { data: existing } = await admin
      .from('tasks')
      .select('code')
      .eq('id', action.task_id)
      .maybeSingle<{ code: string }>()
    return {
      success: `Task already exists: ${existing?.code ?? action.task_id}.`,
    }
  }

  // Task wajib punya project (§20 mapping). Meeting global tanpa project
  // tidak bisa melahirkan task — user harus pindahkan meeting ke project dulu.
  const projectId = access.meeting.project_id
  if (!projectId) {
    return { error: 'This meeting has no project. Move it to a project first.' }
  }

  // PM hanya boleh di project miliknya (aturan task yang existing, §47).
  if (profile.role === 'PROJECT_MANAGER' && !(await isProjectManager(projectId, profile.id))) {
    return { error: 'You do not have permission to perform this action.' }
  }

  // Metadata warisan (§20). Form boleh menimpa, default dari action item.
  const title = readField(formData, 'title') || action.title
  const description = readField(formData, 'description') || action.description || ''
  const assigneeId = readField(formData, 'assignee_id') || action.assignee_id || ''
  const workstreamId = readField(formData, 'workstream_id')
  const priority = readField(formData, 'priority') || action.priority || 'MEDIUM'
  const deadline =
    readField(formData, 'deadline') ||
    action.deadline ||
    new Date().toISOString().slice(0, 10)

  if (!title) return { error: 'Task title is required.' }
  if (!isTaskPriority(priority)) return { error: 'Please choose a valid priority.' }
  if (!validDate(deadline)) return { error: 'Please enter a valid deadline.' }
  if (!assigneeId) return { error: 'Please select an assignee to create this task.' }
  if (!(await assertActiveUser(assigneeId))) {
    return { error: 'Assignee must be an active user.' }
  }
  if (workstreamId && !(await assertWorkstreamInProject(workstreamId, projectId))) {
    return { error: 'Workstream does not belong to this project.' }
  }

  const { data: task, error: taskError } = await admin
    .from('tasks')
    .insert({
      title,
      description: description || null,
      project_id: projectId,
      workstream_id: workstreamId || null,
      assignee_id: assigneeId,
      created_by: profile.id,
      priority,
      status: 'TODO',
      start_date: null,
      deadline,
      // §21 traceability: task tahu dia berasal dari meeting ini.
      source_type: 'MEETING',
      source_id: meetingId,
    })
    .select('id, code, updated_at')
    .single<{ id: string; code: string; updated_at: string }>()

  if (taskError || !task) {
    console.error('createTaskFromActionItem failed:', taskError?.message)
    return { error: 'Unable to create task from action item.' }
  }

  // Klaim atomik: hanya baris yang task_id-nya masih NULL yang menang.
  // Kalau 0 baris = ada request paralel yang menang duluan.
  const { data: claimed } = await admin
    .from('meeting_action_items')
    .update({ task_id: task.id })
    .eq('id', actionItemId)
    .is('task_id', null)
    .select('id')

  if (!claimed || claimed.length === 0) {
    // Kalah race: bersihkan task duplikat (pola yang sama seperti suggestions).
    await admin.from('tasks').update({ is_deleted: true }).eq('id', task.id)
    const { data: winner } = await admin
      .from('meeting_action_items')
      .select('task_id')
      .eq('id', actionItemId)
      .maybeSingle<{ task_id: string | null }>()
    let winnerCode = winner?.task_id ?? ''
    if (winner?.task_id) {
      const { data: wt } = await admin
        .from('tasks')
        .select('code')
        .eq('id', winner.task_id)
        .maybeSingle<{ code: string }>()
      if (wt) winnerCode = wt.code
    }
    return { success: `Task already exists: ${winnerCode}.` }
  }

  // Notifikasi assignee — format key SAMA dengan tasks.ts supaya konsisten
  // (satu task tidak pernah dapat dua email "assigned" untuk stamp yang sama).
  // Setelah COMPLETED/CANCELLED, email dilewati (in-app saja).
  const historical = isHistoricalMeetingStatus(access.meeting.status)
  const label = await projectLabel(projectId)
  let baseUrl = ''
  try {
    baseUrl = getAppBaseUrl()
  } catch {
    console.error('[notify] APP_URL missing, skipping assigned email.')
  }
  await emitNotification({
    key: `task-assigned:${task.id}:${assigneeId}:${task.updated_at}`,
    type: 'TASK_ASSIGNED',
    userIds: [assigneeId],
    title: `Task ${task.code} assigned to you`,
    message: `"${title}" di ${label} di-assign kepadamu (dari meeting ${access.meeting.code}).`,
    entityType: 'task',
    entityId: task.id,
    email:
      !historical && baseUrl
        ? {
            subject: `[Assigned] ${task.code} ${title}`,
            html: `<p>Halo,</p><p>Task berikut di-assign kepadamu (dari meeting ${access.meeting.code}):</p><ul><li><strong>${task.code} ${title}</strong></li><li><strong>Project:</strong> ${label}</li></ul><p>Lihat detail:<br><a href="${baseUrl}/tasks/${task.id}">${baseUrl}/tasks/${task.id}</a></p>`,
            category: 'task',
          }
        : null,
  })

  // Peserta meeting diberi tahu in-app (tanpa email).
  await notifyContentChange({
    meetingId,
    code: access.meeting.code,
    title: access.meeting.title,
    projectId,
    headline: `Task ${task.code} created from action item in ${access.meeting.code}`,
    keySuffix: `task-${task.id}`,
  })

  await logActivity({
    actorUserId: profile.id,
    action: 'MEETING_TASK_CREATED',
    entityType: 'meeting',
    entityId: meetingId,
    entityCode: access.meeting.code,
    projectId,
    metadata: {
      meeting_code: access.meeting.code,
      action_item_id: actionItemId,
      action_item_title: action.title,
      task_id: task.id,
      task_code: task.code,
    },
  })
  await logActivity({
    actorUserId: profile.id,
    action: 'TASK_CREATED',
    entityType: 'task',
    entityId: task.id,
    entityCode: task.code,
    projectId,
    metadata: {
      task_code: task.code,
      task_title: title,
      source_type: 'MEETING',
      source_meeting_id: meetingId,
      source_meeting_code: access.meeting.code,
    },
  })

  revalidateMeeting(meetingId, projectId)
  revalidatePath('/tasks')
  revalidatePath(`/tasks/${task.id}`)
  return { success: `Task ${task.code} created from action item.` }
}

/* ============================================================================
 * GOOGLE SYNC — Opsi A: catat percobaan sync yang gagal (Rule 7)
 * ============================================================================
 *
 * Belum ada OAuth di Phase 11, jadi fungsi ini hanya dipakai tombol "Retry"
 * untuk mencatat bahwa sync dicoba dan gagal secara terkontrol — meeting
 * tetap utuh (MEETING_SYNC_FAILED, bukan data loss).
 */

export async function markMeetingSyncAttempt(
  _prev: MeetingFormState,
  formData: FormData
): Promise<MeetingFormState> {
  const profile = await requireProfile()

  const id = readField(formData, 'id')
  const ok = formData.get('ok') === '1'
  if (!id) return { error: 'Meeting not found.' }

  const access = await getMeetingAccess(id, profile.id, profile.role)
  if (!access.meeting || !canManageMeetingFull(access, profile.role)) {
    return { error: 'You do not have permission to perform this action.' }
  }

  const { error } = await createAdminClient()
    .from('meetings')
    .update({
      google_sync_status: ok ? 'SYNCED' : 'FAILED',
      google_sync_error: ok ? null : 'Google Calendar is not connected yet.',
      google_last_synced_at: new Date().toISOString(),
    })
    .eq('id', id)

  if (error) {
    console.error('markMeetingSyncAttempt failed:', error.message)
    return { error: 'Unable to update sync status.' }
  }

  await logActivity({
    actorUserId: profile.id,
    action: ok ? 'MEETING_SYNCED' : 'MEETING_SYNC_FAILED',
    entityType: 'meeting',
    entityId: id,
    entityCode: access.meeting.code,
    projectId: access.meeting.project_id,
    metadata: { meeting_code: access.meeting.code, manual_retry: true },
  })

  revalidateMeeting(id, access.meeting.project_id)
  return {
    success: ok ? 'Sync status updated.' : 'Sync failed: Google Calendar is not connected yet.',
  }
}
