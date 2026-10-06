import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAppBaseUrl } from '@/lib/app-url'
import { emitNotification } from '@/lib/notifications/service'
import { runMorningDigest } from '@/lib/meetings/digest'
import { todayISO } from '@/lib/utils/dates'

export const dynamic = 'force-dynamic'

type DueTask = {
  id: string
  code: string
  title: string
  project_id: string
  assignee_id: string
  deadline: string
}

/**
 * Scheduler deadline (§34–39): dipanggil oleh Vercel Cron setiap pagi.
 * Auth: header `Authorization: Bearer <CRON_SECRET>`.
 *
 * - DUE_TODAY: deadline = hari ini, status != DONE → key per task per hari.
 * - OVERDUE: deadline < hari ini, status != DONE → key per task per hari
 *   (1 notifikasi per task per hari, §37).
 * - DONE dikecualikan (§39): query hanya status != DONE, jadi task yang
 *   sudah DONE otomatis berhenti dapat notifikasi.
 * - Semua lewat unified service: idempotent + preferensi dihormati.
 * - Gagal di satu task tidak menghentikan task lain, dan tidak merusak
 *   data task apa pun (§75: scheduler failure tidak corrupt data).
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'Scheduler is not configured.' }, { status: 500 })
  }

  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
  }

  const admin = createAdminClient()
  const today = todayISO()

  const { data: tasks, error } = await admin
    .from('tasks')
    .select('id, code, title, project_id, assignee_id, deadline')
    .eq('is_deleted', false)
    .neq('status', 'DONE')
    .neq('status', 'CANCELLED')
    .lte('deadline', today)
    .limit(1000)

  if (error) {
    console.error('[cron] Failed to fetch due tasks:', error.message)
    return NextResponse.json({ error: 'Failed to fetch tasks.' }, { status: 500 })
  }

  const dueToday = ((tasks ?? []) as DueTask[]).filter((t) => t.deadline === today)
  const overdue = ((tasks ?? []) as DueTask[]).filter((t) => t.deadline < today)

  let baseUrl = ''
  try {
    baseUrl = getAppBaseUrl()
  } catch {
    console.error('[cron] APP_URL missing, links will be relative.')
  }

  // Nama project sekali jalan.
  const projectIds = [...new Set(((tasks ?? []) as DueTask[]).map((t) => t.project_id))]
  let projectNames: Record<string, string> = {}
  if (projectIds.length > 0) {
    const { data: projects } = await admin
      .from('projects')
      .select('id, code, name')
      .in('id', projectIds)
    projectNames = Object.fromEntries(
      ((projects ?? []) as { id: string; code: string; name: string }[]).map((p) => [
        p.id,
        `${p.code} · ${p.name}`,
      ])
    )
  }

  let dueTodaySent = 0
  for (const task of dueToday) {
    const result = await emitNotification({
      key: `task-due-today:${task.id}:${today}`,
      type: 'TASK_DEADLINE_APPROACHING',
      userIds: [task.assignee_id],
      title: `Task ${task.code} due today`,
      message: `"${task.title}" deadline hari ini (${task.deadline}).`,
      entityType: 'task',
      entityId: task.id,
      email: {
        subject: `[Due Today] ${task.code} ${task.title}`,
        html: `<p>Halo,</p><p>Task berikut deadline <strong>hari ini</strong>:</p><ul><li><strong>${task.code} ${task.title}</strong></li><li><strong>Project:</strong> ${projectNames[task.project_id] ?? '-'}</li></ul>${baseUrl ? `<p>Lihat detail:<br><a href="${baseUrl}/tasks/${task.id}">${baseUrl}/tasks/${task.id}</a></p>` : ''}`,
        category: 'deadline',
      },
    })
    if (result.emitted) dueTodaySent += 1
  }

  let overdueSent = 0
  for (const task of overdue) {
    const result = await emitNotification({
      key: `task-overdue:${task.id}:${today}`,
      type: 'TASK_OVERDUE',
      userIds: [task.assignee_id],
      title: `Task ${task.code} overdue`,
      message: `"${task.title}" melewati deadline (${task.deadline}).`,
      entityType: 'task',
      entityId: task.id,
      email: {
        subject: `[Overdue] ${task.code} ${task.title}`,
        html: `<p>Halo,</p><p>Task berikut <strong>melewati deadline</strong>:</p><ul><li><strong>${task.code} ${task.title}</strong></li><li><strong>Project:</strong> ${projectNames[task.project_id] ?? '-'}</li><li><strong>Deadline:</strong> ${task.deadline}</li></ul>${baseUrl ? `<p>Lihat detail:<br><a href="${baseUrl}/tasks/${task.id}">${baseUrl}/tasks/${task.id}</a></p>` : ''}`,
        category: 'deadline',
      },
    })
    if (result.emitted) overdueSent += 1
  }

  return NextResponse.json({
    ok: true,
    date: today,
    dueToday: dueTodaySent,
    overdue: overdueSent,
    ...(await morningDigestSummary()),
  })
}

/**
 * Morning Digest (6 Okt 2026): digabung ke cron yang sudah ada supaya tidak
 * perlu jatah cron Vercel baru (Hobby 1×/hari). Jalan 00:00 UTC = 07:00 WIB.
 * Gagal digest tidak menggagalkan deadline reminder — di-catch terpisah.
 */
async function morningDigestSummary(): Promise<{
  digestUsers: number
  digestEmails: number
}> {
  try {
    const { usersNotified, emailsSent } = await runMorningDigest(new Date())
    return { digestUsers: usersNotified, digestEmails: emailsSent }
  } catch (error) {
    console.error('[cron] Morning digest failed:', (error as Error).message)
    return { digestUsers: 0, digestEmails: 0 }
  }
}
