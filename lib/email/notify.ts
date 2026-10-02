import 'server-only'

/**
 * Pengiriman email transaksional via Brevo API.
 *
 * SMTP Supabase hanya untuk email auth. Email notifikasi aplikasi
 * (seperti task DONE) dikirim langsung dari kode via API ini.
 * Kegagalan kirim TIDAK boleh menggagalkan aksi utama — selalu log saja.
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
        htmlContent: input.html,
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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Notifikasi ke semua PM saat task berubah menjadi DONE.
 * Dipanggil SETELAH status tersimpan. Gagal kirim = log saja.
 */
export async function notifyTaskDone(input: {
  pmEmails: { email: string; name?: string }[]
  taskTitle: string
  projectName: string
  assigneeName: string
  evidenceUrl: string | null
  taskUrl: string
}): Promise<void> {
  if (input.pmEmails.length === 0) return

  const title = escapeHtml(input.taskTitle)
  const project = escapeHtml(input.projectName)
  const assignee = escapeHtml(input.assigneeName)
  const taskUrl = escapeHtml(input.taskUrl)

  const evidenceBlock = input.evidenceUrl
    ? `<p>Link evidence:<br><a href="${escapeHtml(input.evidenceUrl)}">${escapeHtml(input.evidenceUrl)}</a></p>`
    : `<p><em>Tidak ada link evidence yang dilampirkan.</em></p>`

  await sendEmail({
    to: input.pmEmails,
    subject: `[DONE] ${input.taskTitle} — ${input.projectName}`,
    html: `<p>Halo,</p>
<p>Kabar baik — task berikut sudah selesai dan membutuhkan perhatian Anda:</p>
<ul>
<li><strong>Task:</strong> ${title}</li>
<li><strong>Project:</strong> ${project}</li>
<li><strong>Dikerjakan oleh:</strong> ${assignee}</li>
</ul>
${evidenceBlock}
<p>Lihat detail task di sini:<br><a href="${taskUrl}">${taskUrl}</a></p>
<p>Terima kasih.</p>
<p><em>Email ini dikirim otomatis oleh Task Management System. Mohon tidak membalas email ini.</em></p>`,
  })
}
