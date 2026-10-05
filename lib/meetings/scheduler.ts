import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { getAppBaseUrl } from '@/lib/app-url'
import { emitNotification } from '@/lib/notifications/service'
import {
  isWithinReminderWindow,
  shiftDays,
  todayInAppTime,
} from '@/lib/utils/meeting-time'
import { needsNotes } from '@/types/meeting'

/**
 * Scheduler Meeting (Phase 11, §31).
 *
 * Dipanggil dari /api/cron/meetings — yang di Hobby dijalankan via
 * Supabase pg_cron + pg_net tiap 15 menit (lihat docs/plan-phase11-meetings.md
 * §10.4), BUKAN via vercel.json (Hobby hanya boleh 1×/hari).
 *
 * Job:
 * 1. Meeting Reminder — SCHEDULED yang mulai dalam 30 menit ke depan.
 *    Jendela 30 menit (bukan 15) supaya satu jadwal yang terlewat satu
 *    run cron masih kena di run berikutnya. Duplikat dicegah event_key
 *    per tanggal (§32): 1 notifikasi + 1 email per meeting per hari,
 *    walau cron jalan berulang.
 * 2. Notes Reminder — COMPLETED kemarin yang notes-nya masih kosong.
 *    Tepat SATU follow-up (§31: "one follow-up reminder", anti-spam).
 *
 * Semua waktu memakai waktu lokal aplikasi (Asia/Jakarta), BUKAN UTC —
 * lihat lib/utils/meeting-time.ts.
 */

const REMINDER_LOOKAHEAD_MINUTES = 30

type SchedulerMeeting = {
  id: string
  code: string
  title: string
  project_id: string | null
  status: string
  meeting_date: string
  start_time: string
  notes: string | null
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

function baseUrlOrEmpty(): string {
  try {
    return getAppBaseUrl()
  } catch {
    console.error('[cron:meetings] APP_URL missing, links will be relative.')
    return ''
  }
}

export async function runMeetingScheduler(now: Date = new Date()): Promise<{
  reminders: number
  notesReminders: number
}> {
  const admin = createAdminClient()
  const today = todayInAppTime(now)
  const tomorrow = shiftDays(today, 1) ?? today
  const yesterday = shiftDays(today, -1) ?? today
  const baseUrl = baseUrlOrEmpty()

  let reminders = 0
  let notesReminders = 0

  // --- 1. Meeting Reminder (15→30 menit sebelum mulai) ---
  const { data: upcoming, error: upcomingError } = await admin
    .from('meetings')
    .select('id, code, title, project_id, status, meeting_date, start_time, notes')
    .eq('status', 'SCHEDULED')
    .gte('meeting_date', today)
    .lte('meeting_date', tomorrow)
    .limit(500)

  if (upcomingError) {
    console.error('[cron:meetings] Failed to fetch scheduled meetings:', upcomingError.message)
  } else {
    const due = ((upcoming ?? []) as SchedulerMeeting[]).filter((m) =>
      isWithinReminderWindow(m, REMINDER_LOOKAHEAD_MINUTES, now)
    )

    for (const m of due) {
      const userIds = await participantUserIds(m.id)
      if (userIds.length === 0) continue

      const label = await projectLabel(m.project_id)
      const result = await emitNotification({
        // Satu meeting = satu reminder per hari, walau cron jalan tiap 15 mnt.
        key: `meeting-reminder:${m.id}:${today}`,
        type: 'MEETING_REMINDER',
        userIds,
        title: `Meeting ${m.code} starts soon`,
        message: `"${m.title}" mulai ${m.start_time.slice(0, 5)} hari ini di ${label}.`,
        entityType: 'meeting',
        entityId: m.id,
        email: {
          subject: `[Reminder] ${m.code} ${m.title} — ${m.start_time.slice(0, 5)}`,
          html: `<p>Halo,</p><p>Meeting berikut dimulai <strong>sebentar lagi</strong>:</p><ul><li><strong>${m.code} ${m.title}</strong></li><li><strong>Waktu:</strong> ${m.meeting_date} ${m.start_time.slice(0, 5)}</li><li><strong>Project:</strong> ${label}</li></ul>${baseUrl ? `<p>Lihat detail:<br><a href="${baseUrl}/meetings/${m.id}">${baseUrl}/meetings/${m.id}</a></p>` : ''}`,
          category: 'meeting',
        },
      })
      if (result.emitted) reminders += 1
    }
  }

  // --- 2. Notes Reminder (COMPLETED kemarin + notes kosong) ---
  const { data: completed, error: completedError } = await admin
    .from('meetings')
    .select('id, code, title, project_id, status, meeting_date, start_time, notes')
    .eq('status', 'COMPLETED')
    .eq('meeting_date', yesterday)
    .limit(500)

  if (completedError) {
    console.error('[cron:meetings] Failed to fetch completed meetings:', completedError.message)
  } else {
    const needy = ((completed ?? []) as SchedulerMeeting[]).filter((m) => needsNotes(m))

    for (const m of needy) {
      const userIds = await participantUserIds(m.id)
      if (userIds.length === 0) continue

      const label = await projectLabel(m.project_id)
      const result = await emitNotification({
        // Satu follow-up per meeting (§31). Key per hari = tidak spam.
        key: `meeting-notes:${m.id}:${today}`,
        type: 'MEETING_NOTES_PENDING',
        userIds,
        title: `Meeting ${m.code} needs notes`,
        message: `"${m.title}" selesai kemarin dan belum ada notes.`,
        entityType: 'meeting',
        entityId: m.id,
        email: {
          subject: `[Notes Needed] ${m.code} ${m.title}`,
          html: `<p>Halo,</p><p>Meeting berikut <strong>belum memiliki notes</strong>:</p><ul><li><strong>${m.code} ${m.title}</strong></li><li><strong>Tanggal:</strong> ${m.meeting_date}</li><li><strong>Project:</strong> ${label}</li></ul>${baseUrl ? `<p>Lengkapi di sini:<br><a href="${baseUrl}/meetings/${m.id}?tab=notes">${baseUrl}/meetings/${m.id}?tab=notes</a></p>` : ''}`,
          category: 'meeting',
        },
      })
      if (result.emitted) notesReminders += 1
    }
  }

  return { reminders, notesReminders }
}