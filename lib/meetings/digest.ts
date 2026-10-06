import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { getAppBaseUrl } from '@/lib/app-url'
import { emitNotification } from '@/lib/notifications/service'
import { formatMeetingDate, todayInAppTime } from '@/lib/utils/meeting-time'
import {
  buildDigestBody,
  type DigestMeeting,
  type DigestTask,
} from '@/lib/meetings/digest-body'

/**
 * Morning Digest (6 Okt 2026, permintaan owner).
 *
 * Prinsip anti-nyampah:
 * - Isi HANYA: meeting hari ini + task jatuh tempo hari ini/overdue.
 *   TIDAK ada needs-notes, open action items, statistik, dsb.
 * - User yang tidak punya apa-apa hari ini TIDAK dapat apa-apa
 *   (tidak ada email "you're all caught up").
 * - Kategori email sendiri (`digest`) + checkbox opt-out di Settings.
 * - Dijalankan di dalam cron deadline yang sudah ada (00:00 UTC = 07:00 WIB),
 *   jadi tidak perlu jatah cron Vercel baru (Hobby hanya boleh 1×/hari).
 */

export type { DigestMeeting, DigestTask } from '@/lib/meetings/digest-body'

type ActiveUser = { id: string; full_name: string | null; email: string }

export async function runMorningDigest(now: Date = new Date()): Promise<{
  usersNotified: number
  emailsSent: number
}> {
  const admin = createAdminClient()
  const today = todayInAppTime(now)
  const dateLabel = formatMeetingDate(today)

  let baseUrl = ''
  try {
    baseUrl = getAppBaseUrl()
  } catch {
    console.error('[cron:digest] APP_URL missing, links will be relative.')
  }

  // 1. User aktif saja (INVITED/INACTIVE tidak dikirimi digest).
  const { data: users, error: usersError } = await admin
    .from('profiles')
    .select('id, full_name, email')
    .eq('status', 'ACTIVE')
    .limit(500)

  if (usersError) {
    console.error('[cron:digest] Failed to fetch users:', usersError.message)
    return { usersNotified: 0, emailsSent: 0 }
  }

  const activeUsers = (users ?? []) as ActiveUser[]
  if (activeUsers.length === 0) return { usersNotified: 0, emailsSent: 0 }
  const userIds = activeUsers.map((u) => u.id)

  // 2. Meeting SCHEDULED hari ini (1 query) + pesertanya (1 query).
  const { data: meetings } = await admin
    .from('meetings')
    .select('id, code, title, project_id, start_time, organizer_id, created_by')
    .eq('status', 'SCHEDULED')
    .eq('meeting_date', today)
    .limit(500)

  const meetingRows = (meetings ?? []) as {
    id: string
    code: string
    title: string
    project_id: string | null
    start_time: string
    organizer_id: string | null
    created_by: string | null
  }[]

  const { data: parts } = meetingRows.length > 0
    ? await admin
        .from('meeting_participants')
        .select('meeting_id, user_id')
        .in(
          'meeting_id',
          meetingRows.map((m) => m.id)
        )
    : { data: [] as { meeting_id: string; user_id: string | null }[] }

  const participantMap = new Map<string, Set<string>>()
  for (const p of (parts ?? []) as { meeting_id: string; user_id: string | null }[]) {
    if (!p.user_id) continue
    if (!participantMap.has(p.meeting_id)) participantMap.set(p.meeting_id, new Set())
    participantMap.get(p.meeting_id)!.add(p.user_id)
  }

  // 3. Task due hari ini + overdue (1 query).
  const { data: tasks } = await admin
    .from('tasks')
    .select('id, code, title, project_id, assignee_id, deadline')
    .eq('is_deleted', false)
    .neq('status', 'DONE')
    .neq('status', 'CANCELLED')
    .in('assignee_id', userIds)
    .lte('deadline', today)
    .limit(2000)

  const taskRows = (tasks ?? []) as {
    id: string
    code: string
    title: string
    project_id: string
    assignee_id: string
    deadline: string
  }[]

  // 4. Label project (1 query).
  const projectIds = [
    ...new Set([
      ...meetingRows.map((m) => m.project_id).filter((v): v is string => Boolean(v)),
      ...taskRows.map((t) => t.project_id),
    ]),
  ]
  let projectLabels: Record<string, string> = {}
  if (projectIds.length > 0) {
    const { data: projects } = await admin
      .from('projects')
      .select('id, code, name')
      .in('id', projectIds)
    projectLabels = Object.fromEntries(
      ((projects ?? []) as { id: string; code: string; name: string }[]).map((p) => [
        p.id,
        `${p.code} · ${p.name}`,
      ])
    )
  }

  // 5. Emit per user — hanya yang punya isi (anti-nyampah).
  let usersNotified = 0
  let emailsSent = 0

  for (const u of activeUsers) {
    const myMeetings: DigestMeeting[] = meetingRows
      .filter(
        (m) =>
          m.organizer_id === u.id ||
          m.created_by === u.id ||
          participantMap.get(m.id)?.has(u.id)
      )
      .map((m) => ({
        id: m.id,
        code: m.code,
        title: m.title,
        start_time: m.start_time,
        projectLabel: m.project_id ? (projectLabels[m.project_id] ?? '-') : 'Global',
      }))
      .sort((a, b) => (a.start_time < b.start_time ? -1 : 1))

    const myTasks = taskRows.filter((t) => t.assignee_id === u.id)
    const tasksOverdue: DigestTask[] = []
    const tasksDue: DigestTask[] = []
    for (const t of myTasks) {
      const item: DigestTask = {
        id: t.id,
        code: t.code,
        title: t.title,
        deadline: t.deadline,
        projectLabel: projectLabels[t.project_id] ?? '-',
        overdue: t.deadline < today,
      }
      if (item.overdue) tasksOverdue.push(item)
      else tasksDue.push(item)
    }

    if (myMeetings.length === 0 && tasksOverdue.length === 0 && tasksDue.length === 0) {
      continue
    }

    const userName = u.full_name || u.email
    const totalTasks = tasksOverdue.length + tasksDue.length
    const result = await emitNotification({
      key: `morning-digest:${u.id}:${today}`,
      type: 'DAILY_DIGEST',
      userIds: [u.id],
      title: `Brief pagi: ${myMeetings.length} meeting, ${totalTasks} task`,
      message:
        myMeetings.length > 0
          ? `Hari ini ada ${myMeetings.length} meeting: ${myMeetings.map((m) => m.code).join(', ')}.`
          : `${totalTasks} task perlu perhatian hari ini.`,
      entityType: '',
      entityId: '',
      email: {
        subject: `[Brief Pagi ${dateLabel}] ${myMeetings.length} meeting · ${totalTasks} task`,
        html: buildDigestBody({
          userName,
          dateLabel,
          baseUrl,
          meetings: myMeetings,
          tasksDue,
          tasksOverdue,
        }),
        category: 'digest',
      },
    })

    if (result.emitted) {
      usersNotified += 1
      emailsSent += result.emailsSent
    }
  }

  return { usersNotified, emailsSent }
}
