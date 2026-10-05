/**
 * Body email hasil meeting (Phase 11).
 *
 * Modul murni: tidak menyentuh database, jadi bisa diuji tanpa koneksi.
 * Dipakai saat meeting COMPLETED — notes + decisions + action items
 * dikirim di body email supaya peserta tidak perlu membuka aplikasi
 * hanya untuk membaca hasil meeting.
 */

/** Batas notes di email supaya tidak membengkak. Sisanya via link. */
export const NOTES_EMAIL_LIMIT = 3000

/** Escape supaya input user tidak merusak markup email. */
export function escapeHtml(value: string | null | undefined): string {
  return (value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export type CompletionDecision = {
  decision: string
  rationale: string | null
}

export type CompletionActionItem = {
  title: string
  assigneeName: string | null
  deadline: string | null
  status: string
  /** Kode task (T-081) kalau sudah dibuat, null kalau belum. */
  taskCode: string | null
}

export type CompletionSummary = {
  code: string
  title: string
  projectLabel: string
  meetingUrl: string
  notes: string | null
  decisions: CompletionDecision[]
  actionItems: CompletionActionItem[]
  openActionItems: number
}

/**
 * Susun HTML lengkap email "Meeting Completed".
 * Bagian yang kosong tidak ditampilkan (tidak ada header yatim).
 */
export function buildCompletionEmailBody(summary: CompletionSummary): string {
  const parts: string[] = []

  parts.push('<p>Halo,</p>')
  parts.push(
    `<p>Meeting berikut telah selesai. Berikut hasilnya:</p>` +
      `<ul><li><strong>${escapeHtml(summary.code)} ${escapeHtml(summary.title)}</strong></li>` +
      `<li><strong>Project:</strong> ${escapeHtml(summary.projectLabel)}</li></ul>`
  )

  // --- Notes ---
  const notes = (summary.notes ?? '').trim()
  if (notes) {
    const shown = notes.length > NOTES_EMAIL_LIMIT
      ? `${notes.slice(0, NOTES_EMAIL_LIMIT)}…`
      : notes
    // whitespace-pre-line supaya baris baru dari plain-text tetap terbaca.
    parts.push(
      `<h3>Notes</h3><p style="white-space: pre-line;">${escapeHtml(shown)}</p>` +
        (notes.length > NOTES_EMAIL_LIMIT
          ? `<p><em>Notes dipotong. Baca selengkapnya di aplikasi.</em></p>`
          : '')
    )
  } else {
    parts.push('<h3>Notes</h3><p><em>Belum ada notes.</em></p>')
  }

  // --- Decisions ---
  if (summary.decisions.length > 0) {
    const items = summary.decisions
      .map(
        (d, i) =>
          `<li><strong>${i + 1}. ${escapeHtml(d.decision)}</strong>` +
          (d.rationale?.trim() ? `<br><span>${escapeHtml(d.rationale)}</span>` : '') +
          `</li>`
      )
      .join('')
    parts.push(`<h3>Decisions (${summary.decisions.length})</h3><ol>${items}</ol>`)
  } else {
    parts.push('<h3>Decisions</h3><p><em>Tidak ada decision yang dicatat.</em></p>')
  }

  // --- Action Items ---
  if (summary.actionItems.length > 0) {
    const items = summary.actionItems
      .map((a) => {
        const meta: string[] = []
        if (a.assigneeName) meta.push(`Assignee: ${escapeHtml(a.assigneeName)}`)
        if (a.deadline) meta.push(`Deadline: ${escapeHtml(a.deadline)}`)
        meta.push(`Status: ${escapeHtml(a.status.replace('_', ' '))}`)
        meta.push(a.taskCode ? `Task: ${escapeHtml(a.taskCode)}` : 'Task: Not created')
        return `<li><strong>${escapeHtml(a.title)}</strong><br><span>${meta.join(' · ')}</span></li>`
      })
      .join('')
    parts.push(
      `<h3>Action Items (${summary.actionItems.length}` +
        (summary.openActionItems > 0 ? ` · ${summary.openActionItems} open` : '') +
        `)</h3><ol>${items}</ol>`
    )
  } else {
    parts.push('<h3>Action Items</h3><p><em>Tidak ada action item.</em></p>')
  }

  parts.push(
    `<p>Lihat detail meeting:<br><a href="${summary.meetingUrl}">${summary.meetingUrl}</a></p>`
  )

  return parts.join('')
}
