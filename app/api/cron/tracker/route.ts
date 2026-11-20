import { NextResponse } from 'next/server'
import { emitNotification } from '@/lib/notifications/service'
import { isCronAuthorized } from '@/lib/auth/cron'
import { todayISO } from '@/lib/utils/dates'
import { pilotUsers } from '@/lib/hr/reminder'
import { usersMissingTracker } from '@/lib/hr/reminder-run'

export const dynamic = 'force-dynamic'

/**
 * Pengingat Daily Tracker (HR Tahap 1): user aktif yang belum mencatat
 * aktivitas di hari kerja ini mendapat notifikasi IN-APP. Email-nya ikut
 * pengingat sore (/api/cron/sore, 17:00 WIB) supaya satu email per hari
 * (kebijakan notifikasi 20 Nov 2026).
 * Dijalankan dua kali sehari: `?sesi=1` (15:00) dan `?sesi=2` (17:00).
 * Auth: `Authorization: Bearer <CRON_SECRET>`. GET (manual) dan POST (pg_net).
 * Saklar: TRACKER_REMINDER_ENABLED=true; mati = tidak mengirim apa pun.
 * Mode uji: TRACKER_REMINDER_ONLY=<id user,...> = hanya akun itu.
 * Yang cuti/izin/sakit disetujui hari itu tidak diingatkan.
 * Idempotent: event_key per user per hari per sesi.
 */
async function handle(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) return NextResponse.json({ error: 'Scheduler belum dikonfigurasi.' }, { status: 500 })
  if (!isCronAuthorized(request.headers.get('authorization'), secret)) {
    return NextResponse.json({ error: 'Tidak diizinkan.' }, { status: 401 })
  }
  const today = todayISO()
  const sesi = new URL(request.url).searchParams.get('sesi') === '2' ? '2' : '1'

  let missing: Awaited<ReturnType<typeof usersMissingTracker>>
  try {
    missing = await usersMissingTracker(today)
  } catch (error) {
    console.error('[cron/tracker] read failed:', (error as Error).message)
    return NextResponse.json({ error: 'Gagal membaca data.' }, { status: 500 })
  }
  if (missing.skipped) return NextResponse.json({ ok: true, date: today, skipped: missing.skipped })

  let sent = 0
  for (const userId of missing.userIds) {
    const result = await emitNotification({
      key: `tracker-reminder:${userId}:${today}:${sesi}`,
      type: 'TRACKER_REMINDER',
      userIds: [userId],
      title: 'Daily Tracker hari ini belum diisi',
      message: 'Catat aktivitas hari ini sebelum pulang.',
      entityType: 'tracker',
      entityId: today,
      email: null,
    })
    if (result.emitted) sent += 1
  }
  return NextResponse.json({ ok: true, date: today, sesi, reminded: sent, pilot: Boolean(pilotUsers(process.env.TRACKER_REMINDER_ONLY)) })
}

export const GET = handle
export const POST = handle
