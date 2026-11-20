import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { getAppBaseUrl } from '@/lib/app-url'
import { emitNotification } from '@/lib/notifications/service'
import { allRows } from '@/lib/utils/paginate'
import { formatMeetingDate, todayInAppTime } from '@/lib/utils/meeting-time'
import { canApproveLeave } from '@/lib/auth/current-access'
import { usersMissingTracker } from '@/lib/hr/reminder-run'
import { KIND_LABEL, type LeaveKind } from '@/lib/hr/leave'
import {
  buildDigestBody,
  digestHasContent,
  type DigestApproval,
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
 *
 * Pengingat sore (20 Nov 2026, kebijakan notifikasi): varian 'sore' ±17:00 WIB
 * lewat /api/cron/sore. Isinya task jatuh tempo/overdue yang masih terbuka,
 * Daily Tracker yang belum diisi, dan hal yang menunggu persetujuan. Dua
 * email rutin ini menggantikan email per kejadian untuk hal rutin.
 */

export type { DigestMeeting, DigestTask } from '@/lib/meetings/digest-body'

type ActiveUser = { id: string; full_name: string | null; email: string }

export function runMorningDigest(now: Date = new Date()) {
  return runDigest(now, 'pagi')
}

export function runEveningDigest(now: Date = new Date()) {
  return runDigest(now, 'sore')
}

async function runDigest(now: Date, variant: 'pagi' | 'sore'): Promise<{
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

  // 2. Meeting SCHEDULED hari ini (1 query) + pesertanya (1 query). Sore: tidak perlu.
  const { data: meetings } = variant === 'sore'
    ? { data: [] }
    : await admin
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

  const parts = meetingRows.length > 0
    ? await allRows<{ meeting_id: string; user_id: string | null }>((from, to) =>
        admin
          .from('meeting_participants')
          .select('meeting_id, user_id')
          .in('meeting_id', meetingRows.map((m) => m.id))
          .order('id')
          .range(from, to)
      )
    : []

  const participantMap = new Map<string, Set<string>>()
  for (const p of parts) {
    if (!p.user_id) continue
    if (!participantMap.has(p.meeting_id)) participantMap.set(p.meeting_id, new Set())
    participantMap.get(p.meeting_id)!.add(p.user_id)
  }

  // 3. Task due hari ini + overdue (1 query).
  const tasks = await allRows<unknown>((from, to) =>
    admin
      .from('tasks')
      .select('id, code, title, project_id, assignee_id, deadline')
      .eq('is_deleted', false)
      .neq('status', 'DONE')
      .neq('status', 'CANCELLED')
      .neq('status', 'REVIEW') // menunggu PM: bukan tanggungan assignee lagi
      .in('assignee_id', userIds)
      .lte('deadline', today)
      .order('id')
      .range(from, to)
  )

  let taskRows = tasks as {
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
      .select('id, code, name, status')
      .in('id', projectIds)
    // Project COMPLETED/CANCELLED tidak lagi mengirim reminder (audit B14).
    const closed = new Set(
      ((projects ?? []) as { id: string; status: string }[])
        .filter((p) => p.status === 'COMPLETED' || p.status === 'CANCELLED')
        .map((p) => p.id)
    )
    taskRows = taskRows.filter((t) => !closed.has(t.project_id))
    projectLabels = Object.fromEntries(
      ((projects ?? []) as { id: string; code: string; name: string }[]).map((p) => [
        p.id,
        `${p.code} · ${p.name}`,
      ])
    )
  }

  // 5. Persetujuan menunggu + (sore) Daily Tracker belum diisi.
  const approvalsByUser = await loadApprovals(userIds)
  const trackerMissing = new Set(
    variant === 'sore' ? (await usersMissingTracker(today).catch(() => ({ userIds: [] as string[] }))).userIds : []
  )

  // 6. Emit per user — hanya yang punya isi (anti-nyampah).
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

    const approvals = approvalsByUser.get(u.id) ?? []
    const content = { meetings: myMeetings, tasksDue, tasksOverdue, approvals, trackerMissing: trackerMissing.has(u.id) }
    if (!digestHasContent(content)) continue

    const userName = u.full_name || u.email
    const totalTasks = tasksOverdue.length + tasksDue.length
    const pending = approvals.length > 0 ? ` · ${approvals.length} menunggu persetujuan` : ''
    const result = await emitNotification({
      key: `${variant === 'sore' ? 'evening' : 'morning'}-digest:${u.id}:${today}`,
      type: 'DAILY_DIGEST',
      userIds: [u.id],
      title:
        variant === 'sore'
          ? `Pengingat sore: ${totalTasks} task${pending}${content.trackerMissing ? ' · Daily Tracker belum diisi' : ''}`
          : `Brief pagi: ${myMeetings.length} meeting, ${totalTasks} task${pending}`,
      message:
        myMeetings.length > 0
          ? `Hari ini ada ${myMeetings.length} meeting: ${myMeetings.map((m) => m.code).join(', ')}.`
          : approvals.length > 0
            ? `${approvals.length} hal menunggu persetujuan Anda.`
            : `${totalTasks} task perlu perhatian hari ini.`,
      entityType: '',
      entityId: '',
      email: {
        subject:
          variant === 'sore'
            ? `[Pengingat Sore ${dateLabel}] ${totalTasks} task${pending}`
            : `[Brief Pagi ${dateLabel}] ${myMeetings.length} meeting · ${totalTasks} task${pending}`,
        html: buildDigestBody({ userName, dateLabel, baseUrl, variant, dateISO: today, ...content }),
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

/**
 * Hal yang menunggu keputusan, per penerima:
 * - task REVIEW -> PM project (tanpa PM: semua Admin aktif);
 * - usulan task PENDING -> PM project (tanpa PM: Admin);
 * - pengajuan cuti PENDING -> penyetuju cuti selain pengaju;
 * - alih task PENDING (pengajuan consultant) / EXPIRED (masa habis) -> PM project.
 */
async function loadApprovals(activeUserIds: string[]): Promise<Map<string, DigestApproval[]>> {
  const admin = createAdminClient()
  const out = new Map<string, DigestApproval[]>()
  const add = (userIds: string[], item: DigestApproval) => {
    for (const id of userIds) {
      if (!activeUserIds.includes(id)) continue
      if (!out.has(id)) out.set(id, [])
      out.get(id)!.push(item)
    }
  }

  const [{ data: reviews }, { data: suggestions }, { data: leaves }, { data: transfers }] = await Promise.all([
    admin.from('tasks').select('id, code, title, project_id, assignee_id').eq('status', 'REVIEW').eq('is_deleted', false).limit(500),
    admin.from('task_suggestions').select('id, code, title, project_id').eq('status', 'PENDING').limit(500),
    admin.from('leave_requests').select('id, user_id, kind, start_date, end_date').eq('status', 'PENDING').limit(500),
    admin.from('task_transfers').select('id, status, requested_by, from_user_id, to_user_id, tasks(code, title, project_id)').in('status', ['PENDING', 'EXPIRED']).limit(500),
  ])
  const reviewRows = (reviews ?? []) as { id: string; code: string; title: string; project_id: string; assignee_id: string }[]
  const suggestionRows = (suggestions ?? []) as { id: string; code: string | null; title: string; project_id: string }[]
  const leaveRows = (leaves ?? []) as { id: string; user_id: string; kind: LeaveKind; start_date: string; end_date: string }[]
  const transferRows = ((transfers ?? []) as unknown as {
    id: string
    status: string
    requested_by: string | null
    from_user_id: string
    to_user_id: string
    tasks: { code: string; title: string; project_id: string } | null
  }[]).filter((t) => t.tasks)
  if (reviewRows.length + suggestionRows.length + leaveRows.length + transferRows.length === 0) return out

  const projectIds = [...new Set([...reviewRows, ...suggestionRows, ...transferRows.map((t) => t.tasks!)].map((r) => r.project_id))]
  const [{ data: pms }, { data: admins }, { data: names }] = await Promise.all([
    projectIds.length ? admin.from('project_managers').select('project_id, user_id').in('project_id', projectIds) : Promise.resolve({ data: [] }),
    admin.from('profiles').select('id').eq('role', 'ADMIN').eq('status', 'ACTIVE').is('deleted_at', null),
    admin.from('profiles').select('id, full_name, email').in('id', [
      ...new Set([...reviewRows.map((r) => r.assignee_id), ...leaveRows.map((l) => l.user_id), ...transferRows.flatMap((t) => [t.from_user_id, t.to_user_id])]),
    ]),
  ])
  const pmsByProject = new Map<string, string[]>()
  for (const p of (pms ?? []) as { project_id: string; user_id: string }[]) {
    pmsByProject.set(p.project_id, [...(pmsByProject.get(p.project_id) ?? []), p.user_id])
  }
  const adminIds = ((admins ?? []) as { id: string }[]).map((a) => a.id)
  const deciders = (projectId: string) => pmsByProject.get(projectId) ?? adminIds
  const nameOf = new Map(((names ?? []) as { id: string; full_name: string | null; email: string }[]).map((p) => [p.id, p.full_name || p.email]))

  for (const t of reviewRows) {
    add(deciders(t.project_id).filter((id) => id !== t.assignee_id), {
      title: `${t.code} ${t.title}`,
      detail: `Menunggu review PM · diserahkan ${nameOf.get(t.assignee_id) ?? '-'}`,
      path: `/tasks/${t.id}`,
    })
  }
  for (const sg of suggestionRows) {
    add(deciders(sg.project_id), { title: `${sg.code ?? 'Usulan'} ${sg.title}`, detail: 'Usulan task menunggu keputusan', path: `/task-suggestions/${sg.id}` })
  }
  for (const t of transferRows) {
    const task = t.tasks!
    add(deciders(task.project_id).filter((id) => id !== t.requested_by), {
      title: `${task.code} ${task.title}`,
      detail:
        t.status === 'PENDING'
          ? `Pengajuan alih task ${nameOf.get(t.from_user_id) ?? '-'} → ${nameOf.get(t.to_user_id) ?? '-'}`
          : `Masa alih task habis, masih dipegang ${nameOf.get(t.to_user_id) ?? '-'}`,
      path: '/tasks/alih',
    })
  }
  if (leaveRows.length > 0) {
    const approvers = (await Promise.all(activeUserIds.map(async (id) => ((await canApproveLeave(id)) ? id : null)))).filter(
      (id): id is string => id !== null
    )
    for (const l of leaveRows) {
      const range = l.start_date === l.end_date ? l.start_date : `${l.start_date} s/d ${l.end_date}`
      add(approvers.filter((id) => id !== l.user_id), {
        title: `${KIND_LABEL[l.kind]} ${nameOf.get(l.user_id) ?? '-'}`,
        detail: `Pengajuan ${range} menunggu persetujuan`,
        path: '/cuti/persetujuan',
      })
    }
  }
  return out
}
