'use server'

import { revalidatePath } from 'next/cache'
import { requireProfile } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { can } from '@/lib/auth/permissions'
import { CLOSED_PROJECT_ERROR, isProjectClosed, isProjectManager } from '@/lib/data/projects'
import { assertCanCreateInProject, getMeetingAccess } from '@/lib/data/meeting-access'
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
  MeetingType,
} from '@/types/meeting'
import {
  canCreateTaskFromMeeting,
  canManageMeetingContent,
  canManageMeetingFull,
  isHistoricalMeetingStatus,
} from '@/lib/meetings/rules'
import type { TaskPriority } from '@/types/task'
import { readLimitedField } from '@/lib/forms/limits'
import { isValidDateInput } from '@/lib/forms/dates'
import { meetingNoticeBody, meetingInvitationBody, taskAssignedBody } from '@/lib/email/templates'

export type MeetingFormState = {
  error?: string
  success?: string
} | undefined

/* ============================================================================
 * Helper baca form + validasi dasar
 * ========================================================================== */

// Batas panjang di server (audit B12), lihat lib/forms/limits.ts.
function readField(formData: FormData, name: string): string {
  return readLimitedField(formData, name)
}

function readList(formData: FormData, name: string): string[] {
  return formData
    .getAll(name)
    .map((v) => (typeof v === 'string' ? v.trim() : ''))
    .filter(Boolean)
}

// Tanggal kalender yang benar-benar ada (audit C1).
function validDate(value: string): boolean {
  return isValidDateInput(value)
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


// getMeetingAccess + assertCanCreateInProject: lib/data/meeting-access.ts
// (audit C18, server-only, bukan server action).


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
              meetingNoticeBody({ baseUrl, meetingId: input.meetingId, code: input.code, title: input.title, projectLabel: input.projectLabel, intro: input.emailBody }),
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
  // DRAFT belum mengundang siapa pun (audit B6): edit konten tidak dinotifikasi.
  const { data: m } = await createAdminClient()
    .from('meetings')
    .select('status')
    .eq('id', input.meetingId)
    .maybeSingle<{ status: string }>()
  if (m?.status === 'DRAFT') return

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
  if (!projectId) return 'Meeting global (tanpa project)'
  const { data } = await createAdminClient()
    .from('projects')
    .select('code, name')
    .eq('id', projectId)
    .maybeSingle<{ code: string; name: string }>()
  return data ? `${data.code} · ${data.name}` : '-'
}


function validateMeetingFields(input: {
  title: string
  meetingType: string
  meetingDate: string
  startTime: string
  endTime: string
}): string | null {
  if (!input.title) return 'Judul Meeting wajib diisi.'
  if (!isMeetingType(input.meetingType)) return 'Pilih tipe Meeting yang valid.'
  if (!input.meetingDate || !validDate(input.meetingDate)) {
    return 'Masukkan tanggal yang valid.'
  }
  if (!input.startTime || !validTime(input.startTime)) {
    return 'Masukkan jam mulai yang valid.'
  }
  if (!input.endTime || !validTime(input.endTime)) {
    return 'Masukkan jam selesai yang valid.'
  }
  // Bandingkan sebagai menit (format HH:MM tidak bisa dibandingkan string
  // kalau tanpa nol depan, mis. "9:00" > "10:00" secara string).
  const toMin = (v: string) => {
    const m = /^(\d{1,2}):(\d{2})/.exec(v)!
    return Number(m[1]) * 60 + Number(m[2])
  }
  if (toMin(input.endTime) <= toMin(input.startTime)) {
    return 'Jam selesai harus setelah jam mulai.'
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
    return { error: 'Anda tidak punya izin untuk melakukan aksi ini.' }
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
    return { error: 'Link Meeting harus diawali http(s)://.' }
  }

  // Project: kalau diisi (atau terkunci dari ?project=), validasi scope.
  if (projectId) {
    const scopeError = await assertCanCreateInProject(projectId, profile.id, profile.role)
    if (scopeError) return { error: scopeError }
  }

  // Organizer harus user aktif. Member biasa tidak bisa menunjuk orang lain.
  if (!(await assertActiveUser(organizerId))) {
    return { error: 'Organizer harus berupa user aktif.' }
  }
  if (profile.role === 'TEAM_MEMBER' && organizerId !== profile.id) {
    return { error: 'Anda hanya dapat menjadi Organizer Meeting Anda sendiri.' }
  }

  // Peserta harus user aktif semua.
  for (const pid of participantIds) {
    if (!(await assertActiveUser(pid))) {
      return { error: 'Semua peserta harus berupa user aktif.' }
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
    return { error: 'Tidak dapat membuat Meeting. Silakan coba lagi.' }
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

  // Audit B6 [keputusan default, 8 Nov 2026]: meeting baru berstatus DRAFT;
  // undangan dikirim saat dijadwalkan (scheduleMeeting), bukan saat dibuat.

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
  return {
    success: `Meeting ${created.code} dibuat sebagai DRAFT. Jadwalkan Meeting untuk mengirim undangan.`,
  }
}

export async function updateMeeting(
  _prev: MeetingFormState,
  formData: FormData
): Promise<MeetingFormState> {
  const profile = await requireProfile()

  const id = readField(formData, 'id')
  if (!id) return { error: 'Meeting tidak ditemukan.' }

  const access = await getMeetingAccess(id, profile.id, profile.role)
  if (!access.meeting || !canManageMeetingFull(access, profile.role)) {
    return { error: 'Anda tidak punya izin untuk melakukan aksi ini.' }
  }

  // COMPLETED/CANCELLED adalah historical record (§13): field inti dikunci.
  // Notes tetap bisa diubah lewat updateNotes.
  if (access.meeting.status === 'COMPLETED' || access.meeting.status === 'CANCELLED') {
    return { error: 'Meeting yang COMPLETED atau CANCELLED tidak dapat diubah.' }
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
    return { error: 'Link Meeting harus diawali http(s)://.' }
  }

  // Ganti organizer hanya boleh ADMIN/PM. Member tidak bisa mengalihkan
  // meeting miliknya ke orang lain.
  let organizerId = access.meeting.organizer_id
  const wantOrganizer = readField(formData, 'organizer_id')
  if (wantOrganizer && wantOrganizer !== organizerId) {
    if (profile.role !== 'ADMIN' && profile.role !== 'PROJECT_MANAGER') {
      return { error: 'Anda tidak punya izin untuk melakukan aksi ini.' }
    }
    if (!(await assertActiveUser(wantOrganizer))) {
      return { error: 'Organizer harus berupa user aktif.' }
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
      // add_to_calendar tidak ada di form edit: jangan ditimpa false (audit C9).
    })
    .eq('id', id)
    .select('id, code, updated_at')
    .single<{ id: string; code: string; updated_at: string }>()

  if (error || !updated) {
    console.error('updateMeeting failed:', error?.message)
    return { error: 'Tidak dapat memperbarui Meeting.' }
  }

  const label = await projectLabel(access.meeting.project_id)
  // DRAFT belum mengundang siapa pun: perubahan tidak dinotifikasi (audit B6).
  if (access.meeting.status !== 'DRAFT') {
    await notifyMeetingParticipants({
      key: `meeting-updated:${id}:${updated.updated_at}`,
      type: 'MEETING_UPDATED',
      meetingId: id,
      code: updated.code,
      title,
      projectLabel: label,
      headline: `Meeting ${updated.code} diperbarui: ${title}`,
      emailSubject: `[Meeting Diperbarui] ${updated.code} ${title}`,
      emailBody: 'Meeting berikut diperbarui:',
    })
  }

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
  return { success: 'Meeting berhasil diperbarui.' }
}

/** DRAFT -> SCHEDULED (§13). */
export async function scheduleMeeting(
  _prev: MeetingFormState,
  formData: FormData
): Promise<MeetingFormState> {
  const profile = await requireProfile()

  const id = readField(formData, 'id')
  if (!id) return { error: 'Meeting tidak ditemukan.' }

  const access = await getMeetingAccess(id, profile.id, profile.role)
  if (!access.meeting || !canManageMeetingFull(access, profile.role)) {
    return { error: 'Anda tidak punya izin untuk melakukan aksi ini.' }
  }
  if (access.meeting.status !== 'DRAFT') {
    return { error: 'Hanya Meeting DRAFT yang dapat dijadwalkan.' }
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
    return { error: 'Tidak dapat menjadwalkan Meeting.' }
  }

  // Undangan ke semua peserta saat DRAFT -> SCHEDULED (audit B6).
  await notifyMeetingParticipants({
    key: `meeting-invitation:${id}:${updated.updated_at}`,
    type: 'MEETING_INVITATION',
    meetingId: id,
    code: updated.code,
    title: access.meeting.title,
    projectLabel: await projectLabel(access.meeting.project_id),
    headline: `Anda diundang ke ${updated.code}: ${access.meeting.title}`,
    emailSubject: `[Undangan Meeting] ${updated.code} ${access.meeting.title}`,
    emailBody: 'Anda diundang ke meeting berikut:',
  })

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
  return { success: `Meeting ${updated.code} berhasil dijadwalkan.` }
}

/** SCHEDULED -> COMPLETED (§41). Ringkasan post-meeting ditampilkan di UI. */
export async function completeMeeting(
  _prev: MeetingFormState,
  formData: FormData
): Promise<MeetingFormState> {
  const profile = await requireProfile()

  const id = readField(formData, 'id')
  if (!id) return { error: 'Meeting tidak ditemukan.' }

  const access = await getMeetingAccess(id, profile.id, profile.role)
  if (!access.meeting || !canManageMeetingFull(access, profile.role)) {
    return { error: 'Anda tidak punya izin untuk melakukan aksi ini.' }
  }
  if (access.meeting.status !== 'SCHEDULED') {
    return { error: 'Hanya Meeting SCHEDULED yang dapat diselesaikan.' }
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
    return { error: 'Tidak dapat menyelesaikan Meeting.' }
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
    headline: `Meeting ${updated.code} selesai: ${access.meeting.title}`,
    emailSubject: `[Meeting Selesai] ${updated.code} ${access.meeting.title}`,
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
  return { success: `Meeting ${updated.code} selesai.` }
}

/** DRAFT/SCHEDULED -> CANCELLED. COMPLETED tidak bisa dibatalkan. */
export async function cancelMeeting(
  _prev: MeetingFormState,
  formData: FormData
): Promise<MeetingFormState> {
  const profile = await requireProfile()

  const id = readField(formData, 'id')
  if (!id) return { error: 'Meeting tidak ditemukan.' }

  const access = await getMeetingAccess(id, profile.id, profile.role)
  if (!access.meeting || !canManageMeetingFull(access, profile.role)) {
    return { error: 'Anda tidak punya izin untuk melakukan aksi ini.' }
  }
  if (access.meeting.status !== 'DRAFT' && access.meeting.status !== 'SCHEDULED') {
    return { error: 'Hanya Meeting DRAFT atau SCHEDULED yang dapat dibatalkan.' }
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
    return { error: 'Tidak dapat membatalkan Meeting.' }
  }

  const label = await projectLabel(access.meeting.project_id)
  // DRAFT belum pernah mengundang siapa pun: pembatalan tidak dinotifikasi (audit B6).
  if (access.meeting.status !== 'DRAFT') {
    await notifyMeetingParticipants({
      key: `meeting-cancelled:${id}:${updated.updated_at}`,
      type: 'MEETING_CANCELLED',
      meetingId: id,
      code: updated.code,
      title: access.meeting.title,
      projectLabel: label,
      headline: `Meeting ${updated.code} dibatalkan: ${access.meeting.title}`,
      emailSubject: `[Meeting Dibatalkan] ${updated.code} ${access.meeting.title}`,
      emailBody: 'Meeting berikut dibatalkan:',
    })
  }

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
  return { success: `Meeting ${updated.code} dibatalkan.` }
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
  if (!id) return { error: 'Meeting tidak ditemukan.' }

  const access = await getMeetingAccess(id, profile.id, profile.role)
  if (!access.meeting || !canManageMeetingContent(access, profile.role)) {
    return { error: 'Anda tidak punya izin untuk melakukan aksi ini.' }
  }
  if (access.meeting.status === 'CANCELLED') {
    return { error: 'Meeting yang CANCELLED tidak dapat diubah.' }
  }

  const { error } = await createAdminClient()
    .from('meetings')
    .update({ notes: notes || null })
    .eq('id', id)

  if (error) {
    console.error('updateMeetingNotes failed:', error.message)
    return { error: 'Tidak dapat menyimpan Notes.' }
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
    headline: `Notes diperbarui di ${access.meeting.code}`,
    keySuffix: 'notes',
  })

  revalidateMeeting(id, access.meeting.project_id)
  return { success: 'Notes berhasil disimpan.' }
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
  if (!meetingId) return { error: 'Meeting tidak ditemukan.' }
  if (!title) return { error: 'Judul Agenda wajib diisi.' }

  const access = await getMeetingAccess(meetingId, profile.id, profile.role)
  if (!access.meeting || !canManageMeetingContent(access, profile.role)) {
    return { error: 'Anda tidak punya izin untuk melakukan aksi ini.' }
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
    return { error: 'Tidak dapat menambah Agenda.' }
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
    headline: `Agenda ditambahkan di ${access.meeting.code}`,
    keySuffix: 'agenda-added',
  })

  revalidateMeeting(meetingId, access.meeting.project_id)
  return { success: 'Agenda berhasil ditambahkan.' }
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
  if (!id || !meetingId) return { error: 'Agenda tidak ditemukan.' }
  if (!title) return { error: 'Judul Agenda wajib diisi.' }

  const access = await getMeetingAccess(meetingId, profile.id, profile.role)
  if (!access.meeting || !canManageMeetingContent(access, profile.role)) {
    return { error: 'Anda tidak punya izin untuk melakukan aksi ini.' }
  }

  const { error } = await createAdminClient()
    .from('meeting_agendas')
    .update({ title, notes: notes || null })
    .eq('id', id)
    .eq('meeting_id', meetingId)

  if (error) {
    console.error('updateAgenda failed:', error.message)
    return { error: 'Tidak dapat memperbarui Agenda.' }
  }

  await notifyContentChange({
    meetingId,
    code: access.meeting.code,
    title: access.meeting.title,
    projectId: access.meeting.project_id,
    headline: `Agenda diperbarui di ${access.meeting.code}`,
    keySuffix: `agenda-${id}`,
  })

  revalidateMeeting(meetingId, access.meeting.project_id)
  return { success: 'Agenda berhasil diperbarui.' }
}

export async function deleteAgenda(
  _prev: MeetingFormState,
  formData: FormData
): Promise<MeetingFormState> {
  const profile = await requireProfile()

  const id = readField(formData, 'id')
  const meetingId = readField(formData, 'meeting_id')
  if (!id || !meetingId) return { error: 'Agenda tidak ditemukan.' }

  const access = await getMeetingAccess(meetingId, profile.id, profile.role)
  if (!access.meeting || !canManageMeetingContent(access, profile.role)) {
    return { error: 'Anda tidak punya izin untuk melakukan aksi ini.' }
  }

  const { error } = await createAdminClient()
    .from('meeting_agendas')
    .delete()
    .eq('id', id)
    .eq('meeting_id', meetingId)

  if (error) {
    console.error('deleteAgenda failed:', error.message)
    return { error: 'Tidak dapat menghapus Agenda.' }
  }

  await notifyContentChange({
    meetingId,
    code: access.meeting.code,
    title: access.meeting.title,
    projectId: access.meeting.project_id,
    headline: `Agenda dihapus di ${access.meeting.code}`,
    keySuffix: `agenda-del-${id}`,
  })

  revalidateMeeting(meetingId, access.meeting.project_id)
  return { success: 'Agenda berhasil dihapus.' }
}

/** Reorder: terima daftar id berurutan, tulis ulang position 0..n. */
export async function reorderAgendas(
  _prev: MeetingFormState,
  formData: FormData
): Promise<MeetingFormState> {
  const profile = await requireProfile()

  const meetingId = readField(formData, 'meeting_id')
  const orderedIds = readList(formData, 'ordered_ids')
  if (!meetingId || orderedIds.length === 0) return { error: 'Tidak ada yang perlu diurutkan ulang.' }

  const access = await getMeetingAccess(meetingId, profile.id, profile.role)
  if (!access.meeting || !canManageMeetingContent(access, profile.role)) {
    return { error: 'Anda tidak punya izin untuk melakukan aksi ini.' }
  }

  const admin = createAdminClient()
  const { data: rows } = await admin
    .from('meeting_agendas')
    .select('id')
    .eq('meeting_id', meetingId)
  const validIds = new Set(((rows ?? []) as { id: string }[]).map((r) => r.id))
  if (!orderedIds.every((v) => validIds.has(v)) || orderedIds.length !== validIds.size) {
    return { error: 'Urutan Agenda tidak valid.' }
  }

  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await admin
      .from('meeting_agendas')
      .update({ position: i })
      .eq('id', orderedIds[i])
      .eq('meeting_id', meetingId)
    if (error) {
      console.error('reorderAgendas failed:', error.message)
      return { error: 'Tidak dapat mengurutkan ulang Agenda.' }
    }
  }

  await notifyContentChange({
    meetingId,
    code: access.meeting.code,
    title: access.meeting.title,
    projectId: access.meeting.project_id,
    headline: `Agenda diurutkan ulang di ${access.meeting.code}`,
    keySuffix: 'agenda-reorder',
  })

  revalidateMeeting(meetingId, access.meeting.project_id)
  return { success: 'Urutan Agenda berhasil disimpan.' }
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
  if (!meetingId) return { error: 'Meeting tidak ditemukan.' }
  if (!decision) return { error: 'Decision wajib diisi.' }

  const access = await getMeetingAccess(meetingId, profile.id, profile.role)
  if (!access.meeting || !canManageMeetingContent(access, profile.role)) {
    return { error: 'Anda tidak punya izin untuk melakukan aksi ini.' }
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
    return { error: 'Tidak dapat menambah Decision.' }
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
    headline: `Decision ditambahkan di ${access.meeting.code}`,
    keySuffix: 'decision-added',
  })

  revalidateMeeting(meetingId, access.meeting.project_id)
  return { success: 'Decision berhasil ditambahkan.' }
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
  if (!id || !meetingId) return { error: 'Decision tidak ditemukan.' }
  if (!decision) return { error: 'Decision wajib diisi.' }

  const access = await getMeetingAccess(meetingId, profile.id, profile.role)
  if (!access.meeting || !canManageMeetingContent(access, profile.role)) {
    return { error: 'Anda tidak punya izin untuk melakukan aksi ini.' }
  }

  const { error } = await createAdminClient()
    .from('meeting_decisions')
    .update({ decision, rationale: rationale || null })
    .eq('id', id)
    .eq('meeting_id', meetingId)

  if (error) {
    console.error('updateDecision failed:', error.message)
    return { error: 'Tidak dapat memperbarui Decision.' }
  }

  await notifyContentChange({
    meetingId,
    code: access.meeting.code,
    title: access.meeting.title,
    projectId: access.meeting.project_id,
    headline: `Decision diperbarui di ${access.meeting.code}`,
    keySuffix: `decision-${id}`,
  })

  revalidateMeeting(meetingId, access.meeting.project_id)
  return { success: 'Decision berhasil diperbarui.' }
}

export async function deleteDecision(
  _prev: MeetingFormState,
  formData: FormData
): Promise<MeetingFormState> {
  const profile = await requireProfile()

  const id = readField(formData, 'id')
  const meetingId = readField(formData, 'meeting_id')
  if (!id || !meetingId) return { error: 'Decision tidak ditemukan.' }

  const access = await getMeetingAccess(meetingId, profile.id, profile.role)
  if (!access.meeting || !canManageMeetingContent(access, profile.role)) {
    return { error: 'Anda tidak punya izin untuk melakukan aksi ini.' }
  }

  const { error } = await createAdminClient()
    .from('meeting_decisions')
    .delete()
    .eq('id', id)
    .eq('meeting_id', meetingId)

  if (error) {
    console.error('deleteDecision failed:', error.message)
    return { error: 'Tidak dapat menghapus Decision.' }
  }

  await notifyContentChange({
    meetingId,
    code: access.meeting.code,
    title: access.meeting.title,
    projectId: access.meeting.project_id,
    headline: `Decision dihapus di ${access.meeting.code}`,
    keySuffix: `decision-del-${id}`,
  })

  revalidateMeeting(meetingId, access.meeting.project_id)
  return { success: 'Decision berhasil dihapus.' }
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
  if (!meetingId) return { error: 'Meeting tidak ditemukan.' }
  if (!title) return { error: 'Judul Action Item wajib diisi.' }
  if (priority !== '' && !isTaskPriority(priority)) {
    return { error: 'Pilih prioritas yang valid.' }
  }
  if (deadline && !validDate(deadline)) return { error: 'Masukkan Deadline yang valid.' }

  const access = await getMeetingAccess(meetingId, profile.id, profile.role)
  if (!access.meeting || !canManageMeetingContent(access, profile.role)) {
    return { error: 'Anda tidak punya izin untuk melakukan aksi ini.' }
  }

  if (assigneeId && !(await assertActiveUser(assigneeId))) {
    return { error: 'Assignee harus berupa user aktif.' }
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
    return { error: 'Tidak dapat menambah Action Item.' }
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
    headline: `Action Item ditambahkan di ${access.meeting.code}`,
    keySuffix: 'action-added',
  })

  revalidateMeeting(meetingId, access.meeting.project_id)
  return { success: 'Action Item berhasil ditambahkan.' }
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
  if (!id || !meetingId) return { error: 'Action Item tidak ditemukan.' }
  if (!title) return { error: 'Judul Action Item wajib diisi.' }
  if (priority && !isTaskPriority(priority)) {
    return { error: 'Pilih prioritas yang valid.' }
  }
  if (!isActionItemStatus(status)) return { error: 'Pilih status yang valid.' }
  if (deadline && !validDate(deadline)) return { error: 'Masukkan Deadline yang valid.' }

  const access = await getMeetingAccess(meetingId, profile.id, profile.role)
  if (!access.meeting || !canManageMeetingContent(access, profile.role)) {
    return { error: 'Anda tidak punya izin untuk melakukan aksi ini.' }
  }

  // Assignee lama yang kini nonaktif boleh tetap (tidak diubah); hanya
  // assignee baru yang wajib aktif (audit C11).
  const { data: currentItem } = await createAdminClient()
    .from('meeting_action_items')
    .select('assignee_id')
    .eq('id', id)
    .eq('meeting_id', meetingId)
    .maybeSingle<{ assignee_id: string | null }>()
  if (
    assigneeId &&
    assigneeId !== currentItem?.assignee_id &&
    !(await assertActiveUser(assigneeId))
  ) {
    return { error: 'Assignee harus berupa user aktif.' }
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
    return { error: 'Tidak dapat memperbarui Action Item.' }
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
    headline: `Action Item diperbarui di ${access.meeting.code}`,
    keySuffix: `action-${id}`,
  })

  revalidateMeeting(meetingId, access.meeting.project_id)
  return { success: 'Action Item berhasil diperbarui.' }
}

export async function deleteActionItem(
  _prev: MeetingFormState,
  formData: FormData
): Promise<MeetingFormState> {
  const profile = await requireProfile()

  const id = readField(formData, 'id')
  const meetingId = readField(formData, 'meeting_id')
  if (!id || !meetingId) return { error: 'Action Item tidak ditemukan.' }

  const access = await getMeetingAccess(meetingId, profile.id, profile.role)
  if (!access.meeting || !canManageMeetingContent(access, profile.role)) {
    return { error: 'Anda tidak punya izin untuk melakukan aksi ini.' }
  }

  // Traceability (§21): action item yang sudah jadi task tidak boleh
  // dihapus — link Meeting -> T-081 harus tetap ada.
  const { data: current } = await createAdminClient()
    .from('meeting_action_items')
    .select('id, task_id')
    .eq('id', id)
    .eq('meeting_id', meetingId)
    .maybeSingle<{ id: string; task_id: string | null }>()

  if (!current) return { error: 'Action Item tidak ditemukan.' }
  if (current.task_id) {
    // Task yang sudah dihapus tidak mengunci action item (audit B7).
    const { data: linked } = await createAdminClient()
      .from('tasks')
      .select('is_deleted')
      .eq('id', current.task_id)
      .maybeSingle<{ is_deleted: boolean }>()
    if (linked && !linked.is_deleted) {
      return { error: 'Action Item ini sudah memiliki task dan tidak dapat dihapus.' }
    }
  }

  // task_id harus masih sama dengan yang dicek (audit B7: hindari race
  // dengan createTaskFromActionItem yang mengklaim baris ini).
  const deleteQuery = createAdminClient()
    .from('meeting_action_items')
    .delete()
    .eq('id', id)
    .eq('meeting_id', meetingId)
  const { error } = await (current.task_id
    ? deleteQuery.eq('task_id', current.task_id)
    : deleteQuery.is('task_id', null))

  if (error) {
    console.error('deleteActionItem failed:', error.message)
    return { error: 'Tidak dapat menghapus Action Item.' }
  }

  await notifyContentChange({
    meetingId,
    code: access.meeting.code,
    title: access.meeting.title,
    projectId: access.meeting.project_id,
    headline: `Action Item dihapus di ${access.meeting.code}`,
    keySuffix: `action-del-${id}`,
  })

  revalidateMeeting(meetingId, access.meeting.project_id)
  return { success: 'Action Item berhasil dihapus.' }
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
  if (!meetingId) return { error: 'Meeting tidak ditemukan.' }

  const access = await getMeetingAccess(meetingId, profile.id, profile.role)
  if (!access.meeting || !canManageMeetingFull(access, profile.role)) {
    return { error: 'Anda tidak punya izin untuk melakukan aksi ini.' }
  }

  // Internal XOR eksternal (sama seperti CHECK di DB).
  const hasInternal = Boolean(userId)
  const hasExternal = Boolean(externalName && externalEmail)
  if (hasInternal === hasExternal) {
    // Peserta eksternal sengaja tidak ada di UI (akses pihak luar dimatikan,
    // keputusan pemilik 8 Nov 2026); pesan tidak menyebutnya (audit C10).
    return { error: 'Pilih peserta.' }
  }

  const admin = createAdminClient()

  if (hasInternal) {
    if (!(await assertActiveUser(userId))) {
      return { error: 'Peserta harus berupa user aktif.' }
    }
    const { error } = await admin.from('meeting_participants').insert({
      meeting_id: meetingId,
      user_id: userId,
    })
    if (error) {
      if (error.code === '23505') return { error: 'User sudah menjadi peserta.' }
      console.error('addParticipant failed:', error.message)
      return { error: 'Tidak dapat menambah peserta.' }
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
    // DRAFT: undangan menyusul saat meeting dijadwalkan (audit B6).
    if (added && access.meeting.status !== 'DRAFT') {
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
        title: `Anda diundang ke ${access.meeting.code}: ${access.meeting.title}`,
        message: `"${access.meeting.title}" (${access.meeting.code}) di ${label}.`,
        entityType: 'meeting',
        entityId: meetingId,
        email:
          !historical && baseUrl
            ? {
                subject: `[Undangan Meeting] ${access.meeting.code} ${access.meeting.title}`,
                html: meetingInvitationBody({ baseUrl, meetingId, code: access.meeting.code, title: access.meeting.title, projectLabel: label }),
                category: 'meeting',
              }
            : null,
      })
    }
  } else {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(externalEmail)) {
      return { error: 'Masukkan Email eksternal yang valid.' }
    }
    const { error } = await admin.from('meeting_participants').insert({
      meeting_id: meetingId,
      external_name: externalName,
      external_email: externalEmail,
    })
    if (error) {
      console.error('addParticipant (external) failed:', error.message)
      return { error: 'Tidak dapat menambah peserta.' }
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
  return { success: 'Peserta berhasil ditambahkan.' }
}

export async function removeParticipant(
  _prev: MeetingFormState,
  formData: FormData
): Promise<MeetingFormState> {
  const profile = await requireProfile()

  const meetingId = readField(formData, 'meeting_id')
  const participantId = readField(formData, 'participant_id')
  if (!meetingId || !participantId) return { error: 'Peserta tidak ditemukan.' }

  const access = await getMeetingAccess(meetingId, profile.id, profile.role)
  if (!access.meeting || !canManageMeetingFull(access, profile.role)) {
    return { error: 'Anda tidak punya izin untuk melakukan aksi ini.' }
  }

  const admin = createAdminClient()
  const { data: row } = await admin
    .from('meeting_participants')
    .select('id, user_id')
    .eq('id', participantId)
    .eq('meeting_id', meetingId)
    .maybeSingle<{ id: string; user_id: string | null }>()

  if (!row) return { error: 'Peserta tidak ditemukan.' }

  // Organizer meeting tidak bisa dihapus dari daftar peserta — ganti dulu
  // organizer-nya lewat Edit Meeting kalau memang perlu.
  if (row.user_id && row.user_id === access.meeting.organizer_id) {
    return { error: 'Organizer tidak dapat dihapus. Ubah Organizer terlebih dahulu.' }
  }

  const { error } = await admin
    .from('meeting_participants')
    .delete()
    .eq('id', participantId)
    .eq('meeting_id', meetingId)

  if (error) {
    console.error('removeParticipant failed:', error.message)
    return { error: 'Tidak dapat menghapus peserta.' }
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
    headline: `Peserta dihapus di ${access.meeting.code}`,
    keySuffix: `participant-del-${participantId}`,
  })

  revalidateMeeting(meetingId, access.meeting.project_id)
  return { success: 'Peserta berhasil dihapus.' }
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
  if (!meetingId || !participantId) return { error: 'Peserta tidak ditemukan.' }
  if (!isAttendance(attendance)) return { error: 'Pilih kehadiran yang valid.' }

  const access = await getMeetingAccess(meetingId, profile.id, profile.role)
  if (!access.meeting) return { error: 'Meeting tidak ditemukan.' }

  const admin = createAdminClient()
  const { data: row } = await admin
    .from('meeting_participants')
    .select('id, user_id')
    .eq('id', participantId)
    .eq('meeting_id', meetingId)
    .maybeSingle<{ id: string; user_id: string | null }>()

  if (!row) return { error: 'Peserta tidak ditemukan.' }

  const isOwn = row.user_id === profile.id
  if (!isOwn && !canManageMeetingFull(access, profile.role)) {
    return { error: 'Anda tidak punya izin untuk melakukan aksi ini.' }
  }

  const { error } = await admin
    .from('meeting_participants')
    .update({ attendance })
    .eq('id', participantId)
    .eq('meeting_id', meetingId)

  if (error) {
    console.error('updateAttendance failed:', error.message)
    return { error: 'Tidak dapat memperbarui kehadiran.' }
  }

  await notifyContentChange({
    meetingId,
    code: access.meeting.code,
    title: access.meeting.title,
    projectId: access.meeting.project_id,
    headline: `Kehadiran diperbarui di ${access.meeting.code}`,
    keySuffix: `attendance-${participantId}`,
  })

  revalidateMeeting(meetingId, access.meeting.project_id)
  return { success: 'Kehadiran berhasil diperbarui.' }
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
  if (!actionItemId || !meetingId) return { error: 'Action Item tidak ditemukan.' }

  const access = await getMeetingAccess(meetingId, profile.id, profile.role)
  if (!access.meeting || !canCreateTaskFromMeeting(access, profile.role)) {
    return { error: 'Anda tidak punya izin untuk melakukan aksi ini.' }
  }

  const admin = createAdminClient()
  const { data: action } = await admin
    .from('meeting_action_items')
    .select('id, meeting_id, title, description, assignee_id, deadline, priority, status, task_id')
    .eq('id', actionItemId)
    .eq('meeting_id', meetingId)
    .maybeSingle<ActionItemFull>()

  if (!action) return { error: 'Action Item tidak ditemukan.' }

  // §22 idempotency guard: task sudah ada -> jangan buat lagi. Task yang
  // sudah dihapus tidak dihitung (audit B7): action item boleh dibuatkan lagi.
  const staleTaskId = action.task_id
  if (action.task_id) {
    const { data: existing } = await admin
      .from('tasks')
      .select('code, is_deleted')
      .eq('id', action.task_id)
      .maybeSingle<{ code: string; is_deleted: boolean }>()
    if (existing && !existing.is_deleted) {
      return { success: `Task sudah ada: ${existing.code}.` }
    }
  }

  // Task wajib punya project (§20 mapping). Meeting global tanpa project:
  // project dipilih di form saat membuat task (audit A10).
  const projectId = access.meeting.project_id || readField(formData, 'project_id')
  if (!projectId) {
    return { error: 'Pilih Project untuk task ini.' }
  }
  if (!access.meeting.project_id) {
    const { data: chosen } = await admin
      .from('projects')
      .select('id')
      .eq('id', projectId)
      .maybeSingle<{ id: string }>()
    if (!chosen) return { error: 'Pilih Project untuk task ini.' }
  }

  // PM hanya boleh di project miliknya (aturan task yang existing, §47).
  if (profile.role === 'PROJECT_MANAGER' && !(await isProjectManager(projectId, profile.id))) {
    return { error: 'Anda tidak punya izin untuk melakukan aksi ini.' }
  }
  if (await isProjectClosed(projectId)) return { error: CLOSED_PROJECT_ERROR } // audit B14

  // Metadata warisan (§20). Form boleh menimpa, default dari action item.
  const title = readField(formData, 'title') || action.title
  const description = readField(formData, 'description') || action.description || ''
  const assigneeId = readField(formData, 'assignee_id') || action.assignee_id || ''
  const workstreamId = readField(formData, 'workstream_id')
  const priority = readField(formData, 'priority') || action.priority || 'MEDIUM'
  // Deadline wajib (audit B11): tidak lagi diam-diam menjadi hari ini.
  const deadline = readField(formData, 'deadline') || action.deadline || ''

  if (!title) return { error: 'Judul Task wajib diisi.' }
  if (!isTaskPriority(priority)) return { error: 'Pilih prioritas yang valid.' }
  if (!deadline) return { error: 'Tetapkan Deadline untuk task ini.' }
  if (!validDate(deadline)) return { error: 'Masukkan Deadline yang valid.' }
  if (!assigneeId) return { error: 'Pilih Assignee untuk membuat task ini.' }
  if (!(await assertActiveUser(assigneeId))) {
    return { error: 'Assignee harus berupa user aktif.' }
  }
  if (workstreamId && !(await assertWorkstreamInProject(workstreamId, projectId))) {
    return { error: 'Workstream bukan milik Project ini.' }
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
    return { error: 'Tidak dapat membuat Task dari Action Item.' }
  }

  // Klaim atomik: hanya baris yang task_id-nya masih sama (NULL, atau task
  // lama yang sudah dihapus) yang menang. 0 baris = request paralel menang.
  const claimQuery = admin
    .from('meeting_action_items')
    .update({ task_id: task.id })
    .eq('id', actionItemId)
  const { data: claimed } = await (staleTaskId
    ? claimQuery.eq('task_id', staleTaskId)
    : claimQuery.is('task_id', null)
  ).select('id')

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
    return { success: `Task sudah ada: ${winnerCode}.` }
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
    title: `Task ${task.code} ditugaskan kepada Anda`,
    message: `"${title}" di ${label} ditugaskan kepada Anda (dari meeting ${access.meeting.code}).`,
    entityType: 'task',
    entityId: task.id,
    email:
      !historical && baseUrl
        ? {
            subject: `[Ditugaskan] ${task.code} ${title}`,
            html: taskAssignedBody({ baseUrl, taskId: task.id, code: task.code, title, projectLabel: label, fromMeetingCode: access.meeting.code }),
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
    headline: `Task ${task.code} dibuat dari Action Item di ${access.meeting.code}`,
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
  return { success: `Task ${task.code} dibuat dari Action Item.` }
}
