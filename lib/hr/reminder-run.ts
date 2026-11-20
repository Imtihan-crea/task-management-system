import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { allRows } from '@/lib/utils/paginate'
import { loadCalendar, loadLeave } from '@/lib/hr/data'
import { workingDays } from '@/lib/hr/tracker'
import { pilotUsers, reminderEnabled, usersToRemind, type ReminderUser } from '@/lib/hr/reminder'

/**
 * Siapa yang belum mengisi Daily Tracker hari ini (dipakai pengingat in-app
 * dan email sore). `skipped` terisi bila pengingat mati atau hari libur.
 * Saklar: TRACKER_REMINDER_ENABLED=true; mode uji: TRACKER_REMINDER_ONLY.
 */
export async function usersMissingTracker(today: string): Promise<{ userIds: string[]; skipped?: 'disabled' | 'holiday' }> {
  if (!reminderEnabled(process.env.TRACKER_REMINDER_ENABLED)) return { userIds: [], skipped: 'disabled' }
  const isWorkday = workingDays(today, today, await loadCalendar(today, today)).length === 1
  if (!isWorkday) return { userIds: [], skipped: 'holiday' }

  const admin = createAdminClient()
  const [users, logged] = await Promise.all([
    allRows<ReminderUser>((from, to) =>
      admin.from('profiles').select('id, status, is_developer, deleted_at, tracker_required').eq('status', 'ACTIVE').order('id').range(from, to)
    ),
    allRows<{ user_id: string }>((from, to) =>
      admin.from('work_logs').select('user_id').eq('work_date', today).order('id').range(from, to)
    ),
  ])
  // Yang sedang cuti/izin/sakit (disetujui) hari ini dianggap sudah beres.
  const onLeave = (await loadLeave({ from: today, to: today, statuses: ['APPROVED'] })).map((l) => l.user_id)
  const done = new Set([...logged.map((l) => l.user_id), ...onLeave])
  return { userIds: usersToRemind(users, done, true, pilotUsers(process.env.TRACKER_REMINDER_ONLY)) }
}
