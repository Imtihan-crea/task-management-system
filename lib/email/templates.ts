/**
 * Template body email transaksional (murni, tanpa I/O) supaya bisa dirender
 * dan diuji tanpa database (lihat scripts/render-emails.mjs).
 * Semua data pengguna di-escape di sini; `introHtml` dan `intro` adalah
 * markup tepercaya milik pemanggil (data di dalamnya harus sudah di-escape).
 * Branding (header/footer Kasuat) dipasang di `sendEmail`.
 */
import { escapeEmailHtml as h } from '@/lib/email/layout'
import { taskStatusLabel } from '@/lib/auth/roles'

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
      { label: 'Status sebelumnya', text: taskStatusLabel(i.fromStatus) },
    ],
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

export function leaveDecisionBody(i: { baseUrl: string; kindLabel: string; start: string; end: string; approved: boolean; note: string }): string {
  return notice({
    introHtml: `Pengajuan <strong>${h(i.kindLabel)}</strong> Anda ${i.approved ? '<strong>disetujui</strong>' : '<strong>ditolak</strong>'}:`,
    rows: [{ label: 'Tanggal', text: i.start === i.end ? i.start : `${i.start} s/d ${i.end}` }, ...(i.note ? [{ label: 'Catatan', text: i.note }] : [])],
    linkLabel: 'Lihat pengajuan',
    url: u(i.baseUrl, '/cuti'),
  })
}

/** Review PM (20 Nov 2026): ke PM saat consultant submit, atau ke consultant saat dikembalikan. */
export function taskReviewBody(i: { baseUrl: string; taskId: string; code: string; title: string; projectLabel: string; returned: boolean; actorName: string; note: string }): string {
  return notice({
    introHtml: i.returned
      ? `Task berikut <strong>dikembalikan</strong> oleh ${h(i.actorName)} dan perlu dikerjakan lagi:`
      : `${h(i.actorName)} menyerahkan task berikut dan <strong>menunggu review Anda</strong>:`,
    rows: [{ text: `${i.code} ${i.title}` }, { label: 'Project', text: i.projectLabel }, ...(i.note ? [{ label: 'Catatan', text: i.note }] : [])],
    linkLabel: i.returned ? 'Lihat task' : 'Setujui atau kembalikan di sini',
    url: u(i.baseUrl, `/tasks/${i.taskId}`),
  })
}

/** Pengajuan cuti baru ke penyetuju (mendesak: perlu keputusan). */
export function leaveRequestedBody(i: { baseUrl: string; name: string; kindLabel: string; start: string; end: string; days: number }): string {
  return notice({
    introHtml: `${h(i.name)} mengajukan <strong>${h(i.kindLabel)}</strong> dan menunggu persetujuan Anda:`,
    rows: [{ label: 'Tanggal', text: i.start === i.end ? i.start : `${i.start} s/d ${i.end}` }, { label: 'Hari kerja', text: String(i.days) }],
    linkLabel: 'Putuskan di sini',
    url: u(i.baseUrl, '/cuti/persetujuan'),
  })
}

/** Alih task (20 Nov 2026). `intro` = markup tepercaya (data di dalamnya sudah di-escape pemanggil). */
export function taskTransferBody(i: { baseUrl: string; taskId: string; code: string; title: string; intro: string; rows?: Row[]; linkToList?: boolean }): string {
  return notice({
    introHtml: i.intro,
    rows: [{ text: `${i.code} ${i.title}` }, ...(i.rows ?? [])],
    linkLabel: i.linkToList ? 'Putuskan di sini' : 'Lihat task',
    url: u(i.baseUrl, i.linkToList ? '/tasks/alih' : `/tasks/${i.taskId}`),
  })
}
