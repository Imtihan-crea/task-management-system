// Render semua template email dengan data palsu ke HTML (di luar repo) dan cek:
// data pengguna ter-escape, tautan menuju alamat resmi, tidak ada teks Inggris yang
// seharusnya Indonesia, subject konsisten. Tanpa database, tanpa kirim email.
// Pakai: npm run emails:render [-- <folder-keluaran>]
// Bawaan keluaran: ~/.cache/taskmgmt-smoke/fase3/emails
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { brandEmailHtml } from '@/lib/email/layout'
import { CANONICAL_ORIGIN } from '@/lib/config/canonical'
import * as t from '@/lib/email/templates'
import { buildCompletionEmailBody } from '@/lib/meetings/completion-email'
import { buildDigestBody } from '@/lib/meetings/digest-body'
import { buildErrorAlert } from '@/lib/monitoring/error-alert'

const out = process.argv[2] ?? path.join(os.homedir(), '.cache/taskmgmt-smoke/fase3/emails')
fs.mkdirSync(out, { recursive: true })

const base = CANONICAL_ORIGIN
const EVIL = '<script>alert(1)</script> & "kutip"'
const id = '00000000-0000-4000-8000-000000000001'
const common = { baseUrl: base, code: 'T-99', title: EVIL, projectLabel: `001 · ${EVIL}` }

const cases: Record<string, string> = {
  'task-ditugaskan': t.taskAssignedBody({ ...common, taskId: id }),
  'task-ditugaskan-dari-meeting': t.taskAssignedBody({ ...common, taskId: id, fromMeetingCode: 'M-009' }),
  'task-blocked': t.taskBlockedBody({ ...common, taskId: id, fromStatus: 'IN_PROGRESS' }),
  'task-review-pm': t.taskReviewBody({ ...common, taskId: id, returned: false, actorName: EVIL, note: '' }),
  'task-review-dikembalikan': t.taskReviewBody({ ...common, taskId: id, returned: true, actorName: EVIL, note: EVIL }),
  'alih-task-diajukan': t.taskTransferBody({ ...common, taskId: id, intro: 'Budi mengajukan alih task dan <strong>menunggu persetujuan Anda</strong>:', rows: [{ label: 'Catatan', text: EVIL }], linkToList: true }),
  'alih-task-ditolak': t.taskTransferBody({ ...common, taskId: id, intro: 'Pengajuan alih task Anda <strong>ditolak</strong>.', rows: [] }),
  'alih-task-dari-cuti': t.taskTransferBody({ ...common, taskId: id, intro: 'Budi cuti sakit <strong>2026-11-21 s/d 2026-11-23</strong>. Task berikut perlu dialihkan sementara:', linkToList: true, listQuery: `cuti=${id}` }),
  'cuti-diajukan': t.leaveRequestedBody({ baseUrl: base, name: EVIL, kindLabel: 'Cuti Sakit', start: '2026-11-21', end: '2026-11-23', days: 2 }),
  'project-pm': t.projectAssignedBody({ baseUrl: base, projectId: id, code: '001', name: EVIL }),
  'meeting-undangan': t.meetingInvitationBody({ baseUrl: base, meetingId: id, code: 'M-009', title: EVIL, projectLabel: EVIL }),
  'meeting-dibatalkan': t.meetingNoticeBody({ baseUrl: base, meetingId: id, code: 'M-009', title: EVIL, projectLabel: EVIL, intro: 'Meeting berikut dibatalkan:' }),
  'meeting-reminder': t.meetingReminderBody({ baseUrl: base, meetingId: id, code: 'M-009', title: EVIL, date: '2026-11-10', time: '09:00', projectLabel: EVIL }),
  'meeting-selesai': buildCompletionEmailBody({
    code: 'M-009', title: EVIL, projectLabel: EVIL, meetingUrl: `${base}/meetings/${id}`, notes: EVIL,
    decisions: [{ decision: EVIL, rationale: EVIL }],
    actionItems: [{ title: EVIL, assigneeName: EVIL, deadline: '2026-11-12', status: 'IN_PROGRESS', taskCode: 'T-99' }],
    openActionItems: 1,
  }),
  'brief-pagi': buildDigestBody({
    userName: EVIL, dateLabel: 'Senin, 9 Nov 2026', baseUrl: base,
    meetings: [{ id, code: 'M-009', title: EVIL, start_time: '09:00:00', projectLabel: EVIL }],
    tasksDue: [{ id, code: 'T-99', title: EVIL, deadline: '2026-11-09', projectLabel: EVIL, overdue: false }],
    tasksOverdue: [{ id, code: 'T-98', title: EVIL, deadline: '2026-11-01', projectLabel: EVIL, overdue: true }],
  }),
  'pengingat-sore': buildDigestBody({
    userName: EVIL, dateLabel: 'Jumat, 20 Nov 2026', baseUrl: base, variant: 'sore', dateISO: '2026-11-20', trackerMissing: true,
    meetings: [], tasksDue: [], tasksOverdue: [{ id, code: 'T-98', title: EVIL, deadline: '2026-11-01', projectLabel: EVIL, overdue: true }],
    approvals: [{ title: EVIL, detail: EVIL, path: `/tasks/${id}` }],
  }),
  'error-alert': buildErrorAlert({ error: new Error(EVIL), path: `/x?q=${EVIL}`, method: 'GET', routePath: '/x', routeType: 'render', now: new Date('2026-11-09T01:00:00Z') }).html,
}

// Subject diambil dari kode sumber (template literal `subject: ...`).
const repo = path.resolve(import.meta.dirname, '..')
const subjectFiles = ['app/actions/tasks.ts', 'app/actions/projects.ts', 'app/actions/meetings.ts', 'app/actions/suggestions.ts', 'app/actions/leave.ts', 'app/actions/task-transfers.ts', 'lib/tasks/transfers.ts', 'lib/tasks/leave-transfers.ts', 'app/api/cron/deadlines/route.ts', 'lib/meetings/scheduler.ts', 'lib/meetings/digest.ts', 'lib/notifications/task-assigned.ts', 'lib/monitoring/error-alert.ts']
const subjects: string[] = []
for (const f of subjectFiles) {
  const src = fs.readFileSync(path.join(repo, f), 'utf8')
  for (const m of src.matchAll(/(?:subject|emailSubject): `([^`]+)`/g)) subjects.push(`${f}: ${m[1]}`)
}

const problems: string[] = []
for (const [name, body] of Object.entries(cases)) {
  const html = brandEmailHtml({ title: `[Uji] ${EVIL}`, bodyHtml: body })
  fs.writeFileSync(path.join(out, `${name}.html`), html)
  if (/<script/i.test(html)) problems.push(`${name}: <script> tidak ter-escape`)
  if (/&(?!amp;|lt;|gt;|quot;)/.test(html.replace(/&nbsp;/g, ''))) problems.push(`${name}: & mentah`)
  if (/="[^"]*"[^<>]*"kutip"/.test(html)) problems.push(`${name}: tanda kutip mentah di atribut`)
  for (const m of body.matchAll(/href="([^"]+)"/g)) {
    if (!m[1].startsWith(base + '/') && !m[1].startsWith('https://example.com/')) problems.push(`${name}: tautan di luar alamat resmi: ${m[1]}`)
  }
  const visible = html.replace(/<[^>]+>/g, ' ')
  for (const w of ['Completed meeting', 'Please', 'Click here', 'View details', 'Hello', 'Dear', 'Reminder', 'Cancelled', 'Best regards']) {
    if (visible.includes(w)) problems.push(`${name}: teks Inggris "${w}"`)
  }
}
for (const s of subjects) {
  const subj = s.split(': ').slice(1).join(': ')
  if (!/^\$\{.*?\}|^\[/.test(subj) && !subj.startsWith('[')) problems.push(`subject tanpa tag [..]: ${s}`)
  if (/\[(Meeting (Completed|Cancelled)|Reminder)\]/.test(subj)) problems.push(`subject Inggris: ${s}`)
}

fs.writeFileSync(path.join(out, 'subjects.txt'), subjects.join('\n') + '\n')
console.log(`template dirender: ${Object.keys(cases).length}, subject ditemukan: ${subjects.length}, masalah: ${problems.length}`)
for (const p of problems) console.log('  ' + p)
process.exit(problems.length ? 1 : 0)
