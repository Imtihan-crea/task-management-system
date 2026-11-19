import { NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/auth/cron'
import { runBackup } from '@/lib/backup/run'

export const dynamic = 'force-dynamic'
// Batas aman semua paket Vercel; uji lokal 23 MB DB jauh di bawah ini.
export const maxDuration = 60

/**
 * Backup harian terenkripsi ke email (lib/backup). Dipicu Vercel Cron
 * (vercel.json, 19:00 UTC = 02:00 WIB) dengan `Authorization: Bearer <CRON_SECRET>`.
 * Butuh env BACKUP_PASSPHRASE dan BACKUP_EMAIL_TO. Gagal = 500 + BACKUP_FAILED di activity log.
 */
async function handle(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) return NextResponse.json({ error: 'Scheduler belum dikonfigurasi.' }, { status: 500 })
  if (!isCronAuthorized(request.headers.get('authorization'), secret)) {
    return NextResponse.json({ error: 'Tidak diizinkan.' }, { status: 401 })
  }
  const result = await runBackup(null)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 500 })
  return NextResponse.json({ ok: true, rows: result.rows, size_kb: Math.ceil(result.bytes / 1024) })
}

export const GET = handle
export const POST = handle
