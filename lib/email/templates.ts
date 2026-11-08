/**
 * Template body email transaksional (murni, tanpa I/O) supaya bisa dirender
 * dan diuji tanpa database (lihat scripts/render-emails.mjs).
 * Semua data pengguna di-escape di sini; `introHtml` dan `intro` adalah
 * markup tepercaya milik pemanggil (data di dalamnya harus sudah di-escape).
 * Branding (header/footer Kasuat) dipasang di `sendEmail`.
 */
import { escapeEmailHtml as h } from '@/lib/email/layout'

type Row = { label?: string; text: string }

function rowsHtml(rows: Row[]): string {
  if (rows.length === 0) return ''
  return `<ul>${rows
    .map((r) => (r.label ? `<li><strong>${r.label}:</strong> ${h(r.text)}</li>` : `<li><strong>${h(r.text)}</strong></li>`))
    .join('')}</ul>`
}

function linkHtml(label: string, url: string): string {
  return url ? `<p>${label}:<br><a href="${url}">${url}</a></p>` : ''
}

/** Bentuk umum: sapaan, kalimat pembuka, daftar, tautan. `url` kosong = tautan tidak ditampilkan. */
function notice(input: { introHtml: string; rows?: Row[]; extraHtml?: string; linkLabel?: string; url: string }): string {
  return `<p>Halo,</p><p>${input.introHtml}</p>${rowsHtml(input.rows ?? [])}${input.extraHtml ?? ''}${linkHtml(input.linkLabel ?? 'Lihat detail', input.url)}`
}

const u = (baseUrl: string, path: string) => (baseUrl ? `${baseUrl}${path}` : '')

export function taskAssignedBody(i: { baseUrl: string; taskId: string; code: string; title: string; projectLabel: string; fromMeetingCode?: string }): string {
  return notice({
    introHtml: i.fromMeetingCode
      ? `Task berikut ditugaskan kepada Anda (dari meeting ${h(i.fromMeetingCode)}):`
      : 'Task berikut ditugaskan kepada Anda:',
    rows: [{ text: `${i.code} ${i.title}` }, { label: 'Project', text: i.projectLabel }],
    url: u(i.baseUrl, `/tasks/${i.taskId}`),
  })
}

export function taskBlockedBody(i: { baseUrl: string; taskId: string; code: string; title: string; projectLabel: string; fromStatus: string }): string {
  return notice({
    introHtml: 'Task berikut terhambat dan membutuhkan perhatian:',
    rows: [
      { text: `${i.code} ${i.title}` },
      { label: 'Project', text: i.projectLabel },
      { label: 'Status sebelumnya', text: i.fromStatus.replace('_', ' ') },
    ],
    url: u(i.baseUrl, `/tasks/${i.taskId}`),
  })
}

export function taskDoneBody(i: { baseUrl: string; taskId: string; code: string; title: string; projectLabel: string; assigneeName: string; evidenceUrl: string | null }): string {
  const evidence = i.evidenceUrl
    ? `<p>Link evidence:<br><a href="${h(i.evidenceUrl)}">${h(i.evidenceUrl)}</a></p>`
    : '<p><em>Tidak ada link evidence yang dilampirkan.</em></p>'
  return notice({
    introHtml: 'Kabar baik — task berikut sudah selesai dan membutuhkan perhatian Anda:',
    rows: [
      { label: 'Task', text: `${i.code} ${i.title}` },
      { label: 'Project', text: i.projectLabel },
      { label: 'Dikerjakan oleh', text: i.assigneeName },
    ],
    extraHtml: evidence,
    linkLabel: 'Lihat detail task di sini',
    url: u(i.baseUrl, `/tasks/${i.taskId}`),
  }) + '<p>Terima kasih.</p>'
}

export function deadlineTodayBody(i: { baseUrl: string; taskId: string; code: string; title: string; projectLabel: string }): string {
  return notice({
    introHtml: 'Task berikut deadline <strong>hari ini</strong>:',
    rows: [{ text: `${i.code} ${i.title}` }, { label: 'Project', text: i.projectLabel }],
    url: u(i.baseUrl, `/tasks/${i.taskId}`),
  })
}

export function taskOverdueBody(i: { baseUrl: string; taskId: string; code: string; title: string; projectLabel: string; deadline: string }): string {
  return notice({
    introHtml: 'Task berikut <strong>melewati deadline</strong>:',
    rows: [{ text: `${i.code} ${i.title}` }, { label: 'Project', text: i.projectLabel }, { label: 'Deadline', text: i.deadline }],
    url: u(i.baseUrl, `/tasks/${i.taskId}`),
  })
}

export function projectAssignedBody(i: { baseUrl: string; projectId: string; code: string; name: string }): string {
  return notice({
    introHtml: `Anda ditambahkan sebagai Project Manager di project <strong>${h(i.code)} ${h(i.name)}</strong>.`,
    linkLabel: 'Lihat project',
    url: u(i.baseUrl, `/projects/${i.projectId}`),
  })
}

export function suggestionNewBody(i: { baseUrl: string; id: string; code: string; title: string; projectLabel: string; actorName: string; resubmitted: boolean }): string {
  return notice({
    introHtml: i.resubmitted
      ? 'Usulan task berikut sudah direvisi dan menunggu review Anda lagi:'
      : 'Ada usulan task baru yang menunggu review Anda:',
    rows: [{ text: `${i.code} ${i.title}` }, { label: 'Project', text: i.projectLabel }, { label: 'Diusulkan oleh', text: i.actorName }],
    linkLabel: 'Review di sini',
    url: u(i.baseUrl, `/task-suggestions/${i.id}`),
  })
}

export function suggestionReviewBody(i: { baseUrl: string; id: string; message: string; projectLabel: string; reviewNote: string; convertedTaskId: string | null }): string {
  const note = i.reviewNote ? `<p><strong>Catatan review:</strong> ${h(i.reviewNote)}</p>` : ''
  const taskLink = i.convertedTaskId ? linkHtml('Lihat task', u(i.baseUrl, `/tasks/${i.convertedTaskId}`)) : ''
  return `<p>Halo,</p><p>${h(i.message)}</p><p><strong>Project:</strong> ${h(i.projectLabel)}</p>${note}${taskLink}${linkHtml('Detail suggestion', u(i.baseUrl, `/task-suggestions/${i.id}`))}`
}

export function meetingInvitationBody(i: { baseUrl: string; meetingId: string; code: string; title: string; projectLabel: string }): string {
  return notice({
    introHtml: 'Anda diundang ke meeting berikut:',
    rows: [{ text: `${i.code} ${i.title}` }, { label: 'Project', text: i.projectLabel }],
    url: u(i.baseUrl, `/meetings/${i.meetingId}`),
  })
}

/** Pemberitahuan meeting umum (diperbarui / dibatalkan); `intro` teks polos. */
export function meetingNoticeBody(i: { baseUrl: string; meetingId: string; code: string; title: string; projectLabel: string; intro: string }): string {
  return notice({
    introHtml: h(i.intro),
    rows: [{ text: `${i.code} ${i.title}` }, { label: 'Project', text: i.projectLabel }],
    url: u(i.baseUrl, `/meetings/${i.meetingId}`),
  })
}

export function meetingReminderBody(i: { baseUrl: string; meetingId: string; code: string; title: string; date: string; time: string; projectLabel: string }): string {
  return notice({
    introHtml: 'Meeting berikut dimulai <strong>sebentar lagi</strong>:',
    rows: [{ text: `${i.code} ${i.title}` }, { label: 'Waktu', text: `${i.date} ${i.time}` }, { label: 'Project', text: i.projectLabel }],
    url: u(i.baseUrl, `/meetings/${i.meetingId}`),
  })
}

export function meetingNotesPendingBody(i: { baseUrl: string; meetingId: string; code: string; title: string; date: string; projectLabel: string }): string {
  return notice({
    introHtml: 'Meeting berikut <strong>belum memiliki notes</strong>:',
    rows: [{ text: `${i.code} ${i.title}` }, { label: 'Tanggal', text: i.date }, { label: 'Project', text: i.projectLabel }],
    linkLabel: 'Lengkapi di sini',
    url: u(i.baseUrl, `/meetings/${i.meetingId}?tab=notes`),
  })
}
