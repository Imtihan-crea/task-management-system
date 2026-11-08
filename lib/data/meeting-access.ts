import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { isProjectManager } from '@/lib/data/projects'
import type { MeetingAccess } from '@/lib/meetings/rules'
import type { MeetingStatus } from '@/types/meeting'
import type { UserRole } from '@/types/profile'

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

/** Akses meeting untuk halaman detail (audit C18: dipindah dari file 'use server' supaya tidak terekspos sebagai server action). */
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
