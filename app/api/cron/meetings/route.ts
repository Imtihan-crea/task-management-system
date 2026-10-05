import { NextResponse } from 'next/server'
import { todayInAppTime } from '@/lib/utils/meeting-time'
import { runMeetingScheduler } from '@/lib/meetings/scheduler'

export const dynamic = 'force-dynamic'

/**
 * Scheduler meeting (§31, §32): reminder 15–30 menit + notes reminder.
 *
 * Auth: header `Authorization: Bearer <CRON_SECRET>` (sama seperti
 * /api/cron/deadlines). Dipanggil via Supabase pg_cron + pg_net tiap
 * 15 menit di plan Hobby — lihat docs/plan-phase11-meetings.md §10.4.
 *
 * pg_net memakai HTTP POST, cron manual/Vercel memakai GET — keduanya
 * didukung dan menjalankan handler yang sama persis.
 *
 * Idempotency (§32, Rule 8): event_key per meeting per hari, jadi
 * scheduler boleh jalan berulang — hasilnya tetap 1 notifikasi + 1 email.
 */
async function handle(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'Scheduler is not configured.' }, { status: 500 })
  }

  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
  }

  const now = new Date()
  const { reminders, notesReminders } = await runMeetingScheduler(now)

  return NextResponse.json({
    ok: true,
    date: todayInAppTime(now),
    reminders,
    notesReminders,
  })
}

export async function GET(request: Request) {
  return handle(request)
}

export async function POST(request: Request) {
  return handle(request)
}