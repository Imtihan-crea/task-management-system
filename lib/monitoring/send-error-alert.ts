import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmail } from '@/lib/email/notify'
import { buildErrorAlert, type ErrorAlertInput } from './error-alert'

/** Kirim email error ke semua ADMIN aktif, maksimal 1x per jenis error per jam. */
export async function sendErrorAlert(input: ErrorAlertInput): Promise<void> {
  try {
    const alert = buildErrorAlert(input)
    const admin = createAdminClient()

    // Klaim key di tabel anti-duplikat yang sama dengan notifikasi biasa.
    const { error: claimError } = await admin
      .from('notification_events')
      .insert({ event_key: alert.key })
    if (claimError) return // 23505 = sudah dikirim jam ini; error lain: jangan memperparah

    const { data: admins } = await admin
      .from('profiles')
      .select('email, full_name')
      .eq('role', 'ADMIN')
      .eq('status', 'ACTIVE')
    const to = ((admins ?? []) as { email: string; full_name: string | null }[]).map((a) => ({
      email: a.email,
      name: a.full_name ?? undefined,
    }))
    if (to.length > 0) await sendEmail({ to, subject: alert.subject, html: alert.html })
  } catch (e) {
    // Alert tidak boleh membuat error baru di request yang sudah gagal.
    console.error('[error-alert] gagal mengirim:', (e as Error).message)
  }
}
