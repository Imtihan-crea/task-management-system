import type { NextRequest } from 'next/server'
import { requireProfile } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchMeetingProjects, fetchMeetings, getMeetingScope, matchesMeetingSearch, matchesMeetingTab, type MeetingRow } from '@/lib/data/meetings'
import { parseMeetingFilters } from '@/lib/meetings/filters'
import { excelDate, exportInfo, type ExcelColumn } from '@/lib/export/excel'
import { exportResponse } from '@/lib/export'
import { formatTimeRange } from '@/lib/utils/meeting-time'
import { allRows } from '@/lib/utils/paginate'
import { ACTION_ITEM_STATUS_LABELS, MEETING_STATUS_LABELS, MEETING_TAB_LABELS, MEETING_TYPE_LABELS, type ActionItemRow, type DecisionRow } from '@/types/meeting'
import { todayISO } from '@/lib/utils/dates'
import { onlySelected, selectedIds } from '@/lib/bulk'

export const dynamic = 'force-dynamic'

type Named = { id: string; full_name: string | null; email: string }

/**
 * Daftar Meetings -> Excel (Meetings, Keputusan, Tindak Lanjut). Cakupan data =
 * halaman /meetings: getMeetingScope + fetchMeetings + tab/pencarian yang sama.
 */
export async function GET(request: NextRequest) {
  const profile = await requireProfile()
  const sp = request.nextUrl.searchParams
  const filters = parseMeetingFilters((k) => sp.get(k) ?? '')
  const scope = await getMeetingScope(profile.id, profile.role)

  const [all, projects] = await Promise.all([fetchMeetings(scope, filters), fetchMeetingProjects()])
  const now = new Date()
  const picked = selectedIds(sp)
  const meetings = onlySelected(all.filter((r) => matchesMeetingTab(r, filters.tab, now) && matchesMeetingSearch(r, filters.q)), picked)
  const projectNames = Object.fromEntries(projects.map((p) => [p.id, `${p.code} · ${p.name}`]))

  // Keputusan & action item hanya untuk meeting yang lolos filter (otomatis dalam scope).
  const admin = createAdminClient()
  const ids = meetings.map((m) => m.id)
  const [decisions, actions] = ids.length
    ? await Promise.all([
        allRows<DecisionRow>((from, to) =>
          admin.from('meeting_decisions').select('id, meeting_id, position, decision, rationale, decided_by').in('meeting_id', ids).order('meeting_id').order('position').order('id').range(from, to)
        ),
        allRows<ActionItemRow>((from, to) =>
          admin.from('meeting_action_items').select('id, meeting_id, title, description, assignee_id, deadline, priority, status, task_id').in('meeting_id', ids).order('meeting_id').order('created_at').order('id').range(from, to)
        ),
      ])
    : [[], []]

  const personIds = [...new Set([...meetings.map((m) => m.organizer_id), ...decisions.map((d) => d.decided_by), ...actions.map((a) => a.assignee_id)].filter((v): v is string => !!v))]
  const taskIds = [...new Set(actions.map((a) => a.task_id).filter((v): v is string => !!v))]
  const [people, taskCodes] = await Promise.all([
    personIds.length ? allRows<Named>((from, to) => admin.from('profiles').select('id, full_name, email').in('id', personIds).order('id').range(from, to)) : [],
    taskIds.length ? allRows<{ id: string; code: string }>((from, to) => admin.from('tasks').select('id, code').in('id', taskIds).order('id').range(from, to)) : [],
  ])
  const personName = Object.fromEntries(people.map((p) => [p.id, p.full_name || p.email]))
  const taskCode = Object.fromEntries(taskCodes.map((t) => [t.id, t.code]))
  const who = (id: string | null) => (id ? (personName[id] ?? '') : '')
  const byId = new Map<string, MeetingRow>(meetings.map((m) => [m.id, m]))
  const mt = (id: string) => byId.get(id)

  const meetingCols: ExcelColumn<MeetingRow>[] = [
    { header: 'Kode', width: 10, value: (m) => m.code },
    { header: 'Judul', width: 40, value: (m) => m.title },
    { header: 'Jenis', width: 22, value: (m) => MEETING_TYPE_LABELS[m.meeting_type] },
    { header: 'Project', width: 28, value: (m) => (m.project_id ? (projectNames[m.project_id] ?? '') : 'Global') },
    { header: 'Tanggal', width: 12, value: (m) => excelDate(m.meeting_date) },
    { header: 'Jam', width: 14, value: (m) => formatTimeRange(m.start_time, m.end_time) },
    { header: 'Status', width: 13, value: (m) => MEETING_STATUS_LABELS[m.status] },
    { header: 'Penyelenggara', width: 22, value: (m) => who(m.organizer_id) },
    { header: 'Jumlah Peserta', width: 10, value: (m) => m.participant_count },
  ]
  const decisionCols: ExcelColumn<DecisionRow>[] = [
    { header: 'Kode Meeting', width: 12, value: (d) => mt(d.meeting_id)?.code },
    { header: 'Judul Meeting', width: 36, value: (d) => mt(d.meeting_id)?.title },
    { header: 'Tanggal', width: 12, value: (d) => excelDate(mt(d.meeting_id)?.meeting_date) },
    { header: 'No', width: 5, value: (d) => d.position },
    { header: 'Keputusan', width: 50, value: (d) => d.decision },
    { header: 'Alasan', width: 40, value: (d) => d.rationale },
    { header: 'Diputuskan Oleh', width: 22, value: (d) => who(d.decided_by) },
  ]
  const actionCols: ExcelColumn<ActionItemRow>[] = [
    { header: 'Kode Meeting', width: 12, value: (a) => mt(a.meeting_id)?.code },
    { header: 'Judul Meeting', width: 36, value: (a) => mt(a.meeting_id)?.title },
    { header: 'Tanggal', width: 12, value: (a) => excelDate(mt(a.meeting_id)?.meeting_date) },
    { header: 'Tindak Lanjut', width: 44, value: (a) => a.title },
    { header: 'Deskripsi', width: 40, value: (a) => a.description },
    { header: 'PIC', width: 22, value: (a) => who(a.assignee_id) },
    { header: 'Deadline', width: 12, value: (a) => excelDate(a.deadline) },
    { header: 'Prioritas', width: 11, value: (a) => a.priority },
    { header: 'Status', width: 13, value: (a) => ACTION_ITEM_STATUS_LABELS[a.status] },
    { header: 'Kode Task', width: 10, value: (a) => (a.task_id ? taskCode[a.task_id] : null) },
  ]

  const f = [
    picked && 'Hanya baris terpilih',
    `Tab: ${MEETING_TAB_LABELS[filters.tab]}`,
    filters.q && `Cari: ${filters.q}`,
    filters.project && `Project: ${projectNames[filters.project] ?? filters.project}`,
    filters.type && `Jenis: ${MEETING_TYPE_LABELS[filters.type as keyof typeof MEETING_TYPE_LABELS] ?? filters.type}`,
    filters.status && `Status: ${filters.status}`,
    filters.organizer && `Penyelenggara: ${who(filters.organizer) || filters.organizer}`,
    filters.dateFrom && `Dari: ${filters.dateFrom}`,
    filters.dateTo && `Sampai: ${filters.dateTo}`,
  ].filter(Boolean)
  const info = exportInfo(profile.full_name || profile.email, [`${meetings.length} meeting`, f.join(' · ')])

  return exportResponse(request, `Meetings ${todayISO()}`, [
    { name: 'Meetings', title: 'DAFTAR MEETINGS', info, columns: meetingCols, rows: meetings },
    ...(decisions.length ? [{ name: 'Keputusan', title: 'KEPUTUSAN MEETING', info, columns: decisionCols, rows: decisions }] : []),
    ...(actions.length ? [{ name: 'Tindak Lanjut', title: 'TINDAK LANJUT MEETING', info, columns: actionCols, rows: actions }] : []),
  ])
}
