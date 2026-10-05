import type {
  GoogleSyncStatus,
  MeetingActionItemStatus,
  MeetingAttendance,
  MeetingStatus,
  MeetingType,
  TaskPriority,
} from '@/lib/db'

/**
 * Union enum di-RE-EXPORT di sini, supaya file ini jadi satu-satunya tempat
 * consumer mengimpor tipe domain meeting. Sumber aslinya tetap skema
 * Drizzle (single source of truth).
 */
export type {
  GoogleSyncStatus,
  MeetingActionItemStatus,
  MeetingAttendance,
  MeetingStatus,
  MeetingType,
  TaskPriority,
}

/**
 * Tipe domain Meeting (Phase 11).
 *
 * UNION ENUM sengaja di-import dari skema Drizzle (`lib/db/schema.ts`),
 * bukan ditulis ulang di sini — jadi tidak ada sumber kebenaran ganda.
 * Bandingkan `types/task.ts` yang masih menuliskannya manual (kode Phase 1–9).
 */

/* ------------------------------------------------------------------ */
/* Label untuk tampilan                                               */
/* ------------------------------------------------------------------ */
export const MEETING_TYPE_LABELS: Record<MeetingType, string> = {
  WEEKLY_PROJECT_REVIEW: 'Weekly Project Review',
  PROJECT_KICKOFF: 'Project Kickoff',
  CLIENT_MEETING: 'Client Meeting',
  INTERNAL_MEETING: 'Internal Meeting',
  OPERATIONAL_REVIEW: 'Operational Review',
  MANAGEMENT_REVIEW: 'Management Review',
  AD_HOC: 'Ad Hoc',
  OTHER: 'Other',
}

export const MEETING_STATUS_LABELS: Record<MeetingStatus, string> = {
  DRAFT: 'DRAFT',
  SCHEDULED: 'SCHEDULED',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
}

export const ATTENDANCE_LABELS: Record<MeetingAttendance, string> = {
  PENDING: 'Pending',
  ACCEPTED: 'Accepted',
  DECLINED: 'Declined',
  ATTENDED: 'Attended',
}

export const ACTION_ITEM_STATUS_LABELS: Record<MeetingActionItemStatus, string> = {
  OPEN: 'Open',
  IN_PROGRESS: 'In Progress',
  DONE: 'Done',
  DROPPED: 'Dropped',
}

/* ------------------------------------------------------------------ */
/* Tab Meeting Dashboard (§7)                                          */
/* ------------------------------------------------------------------ */
export const MEETING_TABS = [
  'all',
  'upcoming',
  'today',
  'needs_notes',
  'completed',
] as const

export type MeetingTabKey = (typeof MEETING_TABS)[number]

export const MEETING_TAB_LABELS: Record<MeetingTabKey, string> = {
  all: 'All',
  upcoming: 'Upcoming',
  today: 'Today',
  needs_notes: 'Needs Notes',
  completed: 'Completed',
}

export function isMeetingTab(value: string): value is MeetingTabKey {
  return (MEETING_TABS as readonly string[]).includes(value)
}

export function parseMeetingTab(value: string | undefined): MeetingTabKey {
  return isMeetingTab(value ?? '') ? (value as MeetingTabKey) : 'upcoming'
}

/* ------------------------------------------------------------------ */
/* Tab Meeting Detail (§14)                                            */
/* ------------------------------------------------------------------ */
export const MEETING_DETAIL_TABS = [
  'overview',
  'agenda',
  'notes',
  'decisions',
  'actions',
  'activity',
] as const

export type MeetingDetailTabKey = (typeof MEETING_DETAIL_TABS)[number]

export const MEETING_DETAIL_TAB_LABELS: Record<MeetingDetailTabKey, string> = {
  overview: 'Overview',
  agenda: 'Agenda',
  notes: 'Notes',
  decisions: 'Decisions',
  actions: 'Action Items',
  activity: 'Activity',
}

export function isMeetingDetailTab(value: string): value is MeetingDetailTabKey {
  return (MEETING_DETAIL_TABS as readonly string[]).includes(value)
}

export function parseMeetingDetailTab(value: string | undefined): MeetingDetailTabKey {
  return isMeetingDetailTab(value ?? '') ? (value as MeetingDetailTabKey) : 'overview'
}

/* ------------------------------------------------------------------ */
/* Bentuk baris yang dipakai query (diturunkan dari skema Drizzle)     */
/* ------------------------------------------------------------------ */
export type MeetingListItem = {
  id: string
  code: string
  title: string
  project_id: string | null
  meeting_type: MeetingType
  status: MeetingStatus
  meeting_date: string
  start_time: string
  end_time: string
  location: string | null
  organizer_id: string | null
  google_sync_status: string
  /** Hasil hitung di server (bukan kolom). */
  participant_count?: number
  action_item_count?: number
  task_count?: number
}

export type ActionItemRow = {
  id: string
  meeting_id: string
  title: string
  description: string | null
  assignee_id: string | null
  deadline: string | null
  priority: TaskPriority | null
  status: MeetingActionItemStatus
  /** §22: kalau terisi, task sudah dibuat (idempotency guard). */
  task_id: string | null
}

export type AgendaRow = {
  id: string
  meeting_id: string
  position: number
  title: string
  notes: string | null
}

export type DecisionRow = {
  id: string
  meeting_id: string
  position: number
  decision: string
  rationale: string | null
  decided_by: string | null
}

export type ParticipantRow = {
  id: string
  meeting_id: string
  user_id: string | null
  external_name: string | null
  external_email: string | null
  attendance: MeetingAttendance
  is_organizer: boolean
}

/**
 * "Meeting butuh notes" (§7 / §36).
 *
 * SATU-SATUNYA definisi di seluruh aplikasi — sengaja TIDAK memakai kolom
 * `notes_status` (lihat database/migrations/008_meetings.sql). Kalau nanti ada
 * tempat lain yang butuh definisi ini, PAKAI fungsi ini.
 */
export function needsNotes(meeting: {
  status: string
  notes: string | null
}): boolean {
  return meeting.status === 'COMPLETED' && (meeting.notes ?? '').trim() === ''
}