import { NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/auth/cron'
import { processDueTransfers } from '@/lib/tasks/transfers'

export const dynamic = 'force-dynamic'

/**
 * Penjadwal alih task sementara (tiap 5 menit lewat pg_cron + pg_net):
 * memulai yang sudah tiba waktunya dan mengakhiri yang masanya habis.
 * Auth: `Authorization: Bearer <CRON_SECRET>`. GET (manual) dan POST (pg_net).
 * Aman dijalankan berulang: setiap langkah mengklaim barisnya dulu.
 */
async function handle(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) return NextResponse.json({ error: 'Scheduler belum dikonfigurasi.' }, { status: 500 })
  if (!isCronAuthorized(request.headers.get('authorization'), secret)) {
    return NextResponse.json({ error: 'Tidak diizinkan.' }, { status: 401 })
  }
  try {
    return NextResponse.json({ ok: true, ...(await processDueTransfers(new Date())) })
  } catch (error) {
    console.error('[cron/alih-task] failed:', (error as Error).message)
    return NextResponse.json({ error: 'Alih task gagal diproses.' }, { status: 500 })
  }
}

export const GET = handle
export const POST = handle
