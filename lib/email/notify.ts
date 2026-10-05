import 'server-only'

import { brandEmailHtml } from '@/lib/email/layout'

/**
 * Pengiriman email transaksional via Brevo API.
 *
 * SMTP Supabase hanya untuk email auth. Email notifikasi aplikasi
 * (seperti task DONE) dikirim langsung dari kode via API ini.
 * Kegagalan kirim TIDAK boleh menggagalkan aksi utama — selalu log saja.
 *
 * Branding: setiap email otomatis dibungkus layout Kasuat di sini
 * (satu choke point), jadi pengirim cukup kirim fragmen body.
 */
export async function sendEmail(input: {
  to: { email: string; name?: string }[]
  subject: string
  html: string
}): Promise<boolean> {
  const apiKey = process.env.BREVO_API_KEY
  const senderEmail = process.env.BREVO_SENDER_EMAIL
  const senderName = process.env.BREVO_SENDER_NAME || 'Task Management System'

  if (!apiKey || !senderEmail) {
    console.error('[email] BREVO_API_KEY or BREVO_SENDER_EMAIL is not configured.')
    return false
  }

  if (input.to.length === 0) return true

  try {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'api-key': apiKey,
      },
      body: JSON.stringify({
        sender: { name: senderName, email: senderEmail },
        to: input.to,
        subject: input.subject,
        htmlContent: brandEmailHtml({ title: input.subject, bodyHtml: input.html }),
      }),
    })

    if (!response.ok) {
      const detail = await response.text()
      console.error('[email] Brevo rejected the request:', detail.slice(0, 300))
      return false
    }

    return true
  } catch (error) {
    console.error('[email] Failed to send:', (error as Error).message)
    return false
  }
}
