import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAppBaseUrl } from '@/lib/app-url'
import { emitNotification } from '@/lib/notifications/service'
import { isCronAuthorized } from '@/lib/auth/cron'
import { allRows } from '@/lib/utils/paginate'
import { todayISO } from '@/lib/utils/dates'
import { loadCalendar, loadLeave } from '@/lib/hr/data'
import { workingDays } from '@/lib/hr/tracker'
import { pilotUsers, reminderEnabled, usersToRemind, type ReminderUser } from '@/lib/hr/reminder'
import { trackerReminderBody } from '@/lib/email/templates'

export const dynamic = 'force-dynamic'

/**
 * Pengingat sore Daily Tracker (HR Tahap 1): user aktif yang belum mencatat
 * aktivitas di hari kerja ini mendapat notifikasi in-app + email.
 * Auth: `Authorization: Bearer <CRON_SECRET>`. GET (manual) dan POST (pg_net).
 * Saklar: TRACKER_REMINDER_ENABLED=true; mati = tidak mengirim apa pun.
 * Mode uji: TRACKER_REMINDER_ONLY=<id user,...> = hanya akun itu.
 * Yang cuti/izin/sakit disetujui hari itu tidak diingatkan.
 * Idempotent: event_key per user per hari.
 * Jadwal (pg_cron, sekitar 17:00 WIB) dipasang terpisah setelah uji nyata.
 */
async function handle(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) return NextResponse.json({ error: 'Scheduler belum dikonfigurasi.' }, { status: 500 })
  if (!isCronAuthorized(request.headers.get('authorization'), secret)) {
    return NextResponse.json({ error: 'Tidak diizinkan.' }, { status: 401 })
  }
  const today = todayISO()
  if (!reminderEnabled(process.env.TRACKER_REMINDER_ENABLED)) {
    return NextResponse.json({ ok: true, date: today, skipped: 'disabled' })
  }

  const admin = createAdminClient()
  const isWorkday = workingDays(today, today, await loadCalendar(today, today)).length === 1
  if (!isWorkday) return NextResponse.json({ ok: true, date: today, skipped: 'holiday' })

  let users: ReminderUser[]
  let logged: { user_id: string }[]
  try {
    ;[users, logged] = await Promise.all([
      allRows<ReminderUser>((from, to) =>
        admin.from('profiles').select('id, status, is_developer, deleted_at, tracker_required').eq('status', 'ACTIVE').order('id').range(from, to)
      ),
      allRows<{ user_id: string }>((from, to) =>
        admin.from('work_logs').select('user_id').eq('work_date', today).order('id').range(from, to)
      ),
    ])
  } catch (error) {
    console.error('[cron/tracker] read failed:', (error as Error).message)
    return NextResponse.json({ error: 'Gagal membaca data.' }, { status: 500 })
  }

  let baseUrl = ''
  try {
    baseUrl = getAppBaseUrl()
  } catch {
    console.error('[cron/tracker] APP_URL missing, links will be relative.')
  }

  // Yang sedang cuti/izin/sakit (disetujui) hari ini dianggap sudah beres.
  const onLeave = (await loadLeave({ from: today, to: today, statuses: ['APPROVED'] })).map((l) => l.user_id)
  let sent = 0
  for (const userId of usersToRemind(users, new Set([...logged.map((l) => l.user_id), ...onLeave]), true, pilotUsers(process.env.TRACKER_REMINDER_ONLY))) {
    const result = await emitNotification({
      key: `tracker-reminder:${userId}:${today}`,
      type: 'TRACKER_REMINDER',
      userIds: [userId],
      title: 'Daily Tracker hari ini belum diisi',
      message: 'Catat aktivitas hari ini sebelum pulang.',
      entityType: 'tracker',
      entityId: today,
      email: { subject: '[Pengingat] Daily Tracker hari ini belum diisi', html: trackerReminderBody({ baseUrl, date: today }), category: 'deadline' },
    })
    if (result.emitted) sent += 1
  }
  return NextResponse.json({ ok: true, date: today, reminded: sent, pilot: Boolean(pilotUsers(process.env.TRACKER_REMINDER_ONLY)) })
}

export const GET = handle
export const POST = handle
