/**
 * Body Morning Digest (murni, bisa diuji).
 *
 * Dipisah dari lib/meetings/digest.ts dengan sengaja: modul itu memakai
 * `server-only` + database, jadi tidak bisa diimpor test. Aturan susun
 * email tinggal di sini.
 */

import { escapeEmailHtml } from '@/lib/email/layout'

export type DigestMeeting = {
  id: string
  code: string
  title: string
  start_time: string
  projectLabel: string
}

export type DigestTask = {
  id: string
  code: string
  title: string
  deadline: string
  projectLabel: string
  overdue: boolean
}

/**
 * Susun fragmen HTML digest untuk satu user.
 * Branding (header/footer Kasuat) dipasang otomatis di `sendEmail`.
 * `baseUrl` kosong = link tidak ditampilkan (tetap informatif).
 */
export function buildDigestBody(input: {
  userName: string
  dateLabel: string
  baseUrl: string
  meetings: DigestMeeting[]
  tasksDue: DigestTask[]
  tasksOverdue: DigestTask[]
}): string {
  const parts: string[] = []
  parts.push(`<p>Halo ${escapeEmailHtml(input.userName)},</p>`)
  parts.push(`<p>Brief pagi ${escapeEmailHtml(input.dateLabel)}:</p>`)

  const link = (url: string, text: string) =>
    input.baseUrl ? `<a href="${url}">${text}</a>` : text

  if (input.meetings.length > 0) {
    const items = input.meetings
      .map(
        (m) =>
          `<li><strong>${m.start_time.slice(0, 5)} — ${escapeEmailHtml(m.code)} ` +
          `${link(
            `${input.baseUrl}/meetings/${m.id}`,
            escapeEmailHtml(m.title)
          )}</strong>` +
          `<br><span>${escapeEmailHtml(m.projectLabel)}</span></li>`
      )
      .join('')
    parts.push(`<h3>Meeting Hari Ini (${input.meetings.length})</h3><ul>${items}</ul>`)
  }

  const urgent = [...input.tasksOverdue, ...input.tasksDue]
  if (urgent.length > 0) {
    const items = urgent
      .map(
        (t) =>
          `<li><strong>${escapeEmailHtml(t.code)} ` +
          `${link(`${input.baseUrl}/tasks/${t.id}`, escapeEmailHtml(t.title))}</strong>` +
          `<br><span>${t.overdue ? 'OVERDUE' : 'Due hari ini'} · Deadline: ${escapeEmailHtml(t.deadline)} · ${escapeEmailHtml(t.projectLabel)}</span></li>`
      )
      .join('')
    parts.push(`<h3>Task Perhatian (${urgent.length})</h3><ul>${items}</ul>`)
  }

  return parts.join('')
}
