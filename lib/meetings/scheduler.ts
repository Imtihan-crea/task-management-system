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
import { meetingReminderBody, meetingNotesPendingBody } from '@/lib/email/templates'

/**
 * Scheduler Meeting (Phase 11, §31).
 *
 * Dipanggil dari /api/cron/meetings — yang di Hobby dijalankan via
 * Supabase pg_cron + pg_net tiap 15 menit (lihat docs/plan-phase11-meetings.md
 * §10.4), BUKAN via vercel.json (Hobby hanya boleh 1×/hari).
 *
 * Job:
 * 1. Meeting Reminder — SCHEDULED yang mulai 15–30 menit lagi.
 *    Cron jalan tiap 15 menit dan jendela tiap run adalah [T+15, T+30),
 *    sehingga setiap meeting jatuh TEPAT di 1 run: reminder terkirim
 *    tepat 1 kali, 15–30 menit sebelum mulai. Duplikat tetap dicegah
 *    event_key per tanggal (§32): 1 notifikasi + 1 email per meeting
 *    per hari, walau cron jalan berulang.
 * 2. Notes Reminder — COMPLETED kemarin yang notes-nya masih kosong.
 *    Tepat SATU follow-up (§31: "one follow-up reminder", anti-spam).
 *
 * Semua waktu memakai waktu lokal aplikasi (Asia/Jakarta), BUKAN UTC —
 * lihat lib/utils/meeting-time.ts.
 */

const REMINDER_LEAD_MINUTES = 15
const REMINDER_WINDOW_MINUTES = 15

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

/** Label project untuk banyak meeting sekali query (kunci: project_id). */
async function projectLabels(projectIds: (string | null)[]): Promise<Map<string | null, string>> {
  const labels = new Map<string | null, string>([[null, 'Meeting global (tanpa project)']])
  const ids = [...new Set(projectIds.filter((v): v is string => Boolean(v)))]
  if (ids.length === 0) return labels

  const { data } = await createAdminClient().from('projects').select('id, code, name').in('id', ids)
  for (const p of (data ?? []) as { id: string; code: string; name: string }[]) {
    labels.set(p.id, `${p.code} · ${p.name}`)
  }
  return labels
}

/** Peserta (user_id unik) banyak meeting sekali query (kunci: meeting_id). */
async function participantsByMeeting(meetingIds: string[]): Promise<Map<string, string[]>> {
  const result = new Map<string, string[]>()
  for (let i = 0; i < meetingIds.length; i += 50) {
    const rows = await allRows<{ meeting_id: string; user_id: string | null }>((from, to) =>
      createAdminClient()
        .from('meeting_participants')
        .select('meeting_id, user_id')
        .in('meeting_id', meetingIds.slice(i, i + 50))
        .order('id')
        .range(from, to)
    )
    for (const p of rows) {
      if (!p.user_id) continue
      const list = result.get(p.meeting_id) ?? []
      if (!list.includes(p.user_id)) list.push(p.user_id)
      result.set(p.meeting_id, list)
    }
  }
  return result
}

/** Meeting yang sudah pernah diingatkan notes-nya dengan key lama (per tanggal). */
async function meetingsWithOldNotesEvent(meetingIds: string[]): Promise<Set<string>> {
  const found = new Set<string>()
  // Dipecah per 50 supaya filter .or() di URL tidak terlalu panjang.
  for (let i = 0; i < meetingIds.length; i += 50) {
    const chunk = meetingIds.slice(i, i + 50)
    const rows = await allRows<{ event_key: string }>((from, to) =>
      createAdminClient()
        .from('notification_events')
        .select('event_key')
        .or(chunk.map((id) => `event_key.like.meeting-notes:${id}:%`).join(','))
        .order('event_key')
        .range(from, to)
    )
    for (const row of rows) found.add(row.event_key.split(':')[1])
  }
  return found
}

/**
 * Ambil semua baris per halaman 1000 (batas PostgREST memotong tanpa error).
 * Error dilempar: lebih baik cron gagal dan dicoba lagi daripada peserta
 * terlewat atau notifikasi terkirim ganda.
 */
async function allRows<T>(
  page: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>
): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await page(from, from + 999)
    if (error) throw new Error(`[cron:meetings] query gagal: ${error.message}`)
    const rows = (data ?? []) as T[]
    out.push(...rows)
    if (rows.length < 1000) return out
  }
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

  // --- 1. Meeting Reminder (15–30 menit sebelum mulai, tepat 1 kali) ---
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
      isWithinReminderWindow(m, REMINDER_WINDOW_MINUTES, now, REMINDER_LEAD_MINUTES)
    )

    const [participants, labels] = await Promise.all([
      participantsByMeeting(due.map((m) => m.id)),
      projectLabels(due.map((m) => m.project_id)),
    ])

    for (const m of due) {
      const userIds = participants.get(m.id) ?? []
      if (userIds.length === 0) continue

      const label = labels.get(m.project_id) ?? '-'
      const result = await emitNotification({
        // Satu meeting = satu reminder per hari, walau cron jalan tiap 15 mnt.
        key: `meeting-reminder:${m.id}:${today}`,
        type: 'MEETING_REMINDER',
        userIds,
        title: `Meeting ${m.code} segera dimulai`,
        message: `"${m.title}" mulai ${m.start_time.slice(0, 5)} hari ini di ${label}.`,
        entityType: 'meeting',
        entityId: m.id,
        email: {
          subject: `[Pengingat] ${m.code} ${m.title} — ${m.start_time.slice(0, 5)}`,
          html: meetingReminderBody({ baseUrl, meetingId: m.id, code: m.code, title: m.title, date: m.meeting_date, time: m.start_time.slice(0, 5), projectLabel: label }),
          category: 'meeting',
        },
      })
      if (result.emitted) reminders += 1
    }
  }

  // --- 2. Notes Reminder (COMPLETED sampai kemarin + notes kosong) ---
  // Audit C16: bukan hanya meeting kemarin; meeting yang baru di-complete
  // belakangan juga ikut. Dibatasi 30 hari terakhir; satu kali per meeting.
  const since = shiftDays(today, -30) ?? yesterday
  const { data: completed, error: completedError } = await admin
    .from('meetings')
    .select('id, code, title, project_id, status, meeting_date, start_time, notes')
    .eq('status', 'COMPLETED')
    .lte('meeting_date', yesterday)
    .gte('meeting_date', since)
    .limit(500)

  if (completedError) {
    console.error('[cron:meetings] Failed to fetch completed meetings:', completedError.message)
  } else {
    const needy = ((completed ?? []) as SchedulerMeeting[]).filter((m) => needsNotes(m))

    // Meeting yang sudah diingatkan dengan key lama (per tanggal) tidak
    // dikirim ulang saat key berubah (tanpa ini: banjir sekali saat deploy).
    const oldEvents = await meetingsWithOldNotesEvent(needy.map((m) => m.id))
    const pending = needy.filter((m) => !oldEvents.has(m.id))
    const [participants, labels] = await Promise.all([
      participantsByMeeting(pending.map((m) => m.id)),
      projectLabels(pending.map((m) => m.project_id)),
    ])

    for (const m of pending) {
      const userIds = participants.get(m.id) ?? []
      if (userIds.length === 0) continue

      const label = labels.get(m.project_id) ?? '-'
      const result = await emitNotification({
        // Satu follow-up per meeting (§31): key tanpa tanggal, jadi tidak
        // dikirim ulang setiap hari selama notes masih kosong.
        key: `meeting-notes:${m.id}`,
        type: 'MEETING_NOTES_PENDING',
        userIds,
        title: `Meeting ${m.code} perlu Notes`,
        message: `"${m.title}" (${m.meeting_date}) sudah selesai dan belum ada notes.`,
        entityType: 'meeting',
        entityId: m.id,
        email: {
          subject: `[Perlu Notes] ${m.code} ${m.title}`,
          html: meetingNotesPendingBody({ baseUrl, meetingId: m.id, code: m.code, title: m.title, date: m.meeting_date, projectLabel: label }),
          category: 'meeting',
        },
      })
      if (result.emitted) notesReminders += 1
    }
  }

  return { reminders, notesReminders }
}