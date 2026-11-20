import { NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/auth/cron'
import { runEveningDigest } from '@/lib/meetings/digest'

export const dynamic = 'force-dynamic'

/**
 * Pengingat sore (±17:00 WIB, kebijakan notifikasi 20 Nov 2026): satu email
 * rutin per user berisi task jatuh tempo/overdue yang masih terbuka, Daily
 * Tracker yang belum diisi, dan hal yang menunggu persetujuannya.
 * Auth: `Authorization: Bearer <CRON_SECRET>`. GET (manual) dan POST (pg_net).
 * Idempotent: event_key per user per hari.
 */
async function handle(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) return NextResponse.json({ error: 'Scheduler belum dikonfigurasi.' }, { status: 500 })
  if (!isCronAuthorized(request.headers.get('authorization'), secret)) {
    return NextResponse.json({ error: 'Tidak diizinkan.' }, { status: 401 })
  }
  try {
    const { usersNotified, emailsSent } = await runEveningDigest(new Date())
    return NextResponse.json({ ok: true, usersNotified, emailsSent })
  } catch (error) {
    console.error('[cron/sore] failed:', (error as Error).message)
    return NextResponse.json({ error: 'Pengingat sore gagal.' }, { status: 500 })
  }
}

export const GET = handle
export const POST = handle
