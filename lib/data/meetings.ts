import 'server-only'

import { cache } from 'react'
import { createAdminClient } from '@/lib/supabase/admin'
import { scopeFilter } from '@/lib/meetings/rules'
import type { MeetingScope } from '@/lib/data/meetings-types'
import { isMeetingToday, isMeetingUpcoming, nowInAppTime } from '@/lib/utils/meeting-time'
import {
  needsNotes,
  type ActionItemRow,
  type AgendaRow,
  type DecisionRow,
  type MeetingStatus,
  type MeetingTabKey,
  type MeetingType,
  type ParticipantRow,
} from '@/types/meeting'

export type { MeetingScope } from '@/lib/data/meetings-types'
export { matchesMeetingSearch, matchesMeetingTab, scopeFilter } from '@/lib/meetings/rules'

/**
 * ============================================================================
 * SCOPE — SATU-SUMBER KEBENARAN untuk "meeting mana yang boleh diakses user ini"
 * ============================================================================
 *
 * Mengikuti pola `getDashboardScope()` di lib/data/dashboard.ts: satu fungsi
 * di-cache per request, dipakai semua bagian halaman.
 *
 * PENTING: query di aplikasi ini memakai SERVICE ROLE client yang
 * MELALUI RLS. Jadi RLS TIDAK menjadi penyaring di sini — scope WAJIB
 * ditegakkan di server (komentar yang sama ada di migrasi 003).
 *
 * Space yang dipakai (PRD §37):
 * - ADMIN        : semua meeting
 * - PROJECT_MANAGER: meeting project yang ia kelola, ATAU yang ia buat/
 *                   organizes/peserta
 * - TEAM_MEMBER  : meeting yang ia buat/organizes/peserta
 * - VIEWER       : sama seperti TEAM_MEMBER (hanya baca)
 */

export const getMeetingScope = cache(
  async (userId: string, role: string): Promise<MeetingScope> => {
    // ADMIN melihat semua: tidak perlu query apa pun.
    if (role === 'ADMIN') {
      return { userId, role, managedProjectIds: null, involvedMeetingIds: [] }
    }

    const admin = createAdminClient()

    // Meeting yang dibuat / diorganize user ini.
    const { data: owned } = await admin
      .from('meetings')
      .select('id')
      .or(`organizer_id.eq.${userId},created_by.eq.${userId}`)
      .limit(2000)

    // Meeting yang user ini peserta.
    const { data: asParticipant } = await admin
      .from('meeting_participants')
      .select('meeting_id')
      .eq('user_id', userId)
      .limit(2000)

    const involvedMeetingIds = [
      ...new Set([
        ...((owned ?? []) as { id: string }[]).map((m) => m.id),
        ...((asParticipant ?? []) as { meeting_id: string }[]).map((p) => p.meeting_id),
      ]),
    ]

    // PENTING: null HANYA untuk ADMIN (artinya "tanpa filter").
    // Untuk role lain mulai dari [] supaya scopeFilter tidak salah
    // mengira "tidak perlu pembatasan" dan membocorkan semua meeting.
    let managedProjectIds: string[] | null = []
    if (role === 'PROJECT_MANAGER') {
      const { data: links } = await admin
        .from('project_managers')
        .select('project_id')
        .eq('user_id', userId)
      managedProjectIds = ((links ?? []) as { project_id: string }[]).map((l) => l.project_id)
    }

    return { userId, role, managedProjectIds, involvedMeetingIds }
  }
)

/* ============================================================================
 * LIST + KPI (PRD §5, §6, §9)
 * ============================================================================ */

export type MeetingFilters = {
  tab: MeetingTabKey
  q: string
  project: string
  type: string
  status: string
  organizer: string
  dateFrom: string
  dateTo: string
}

export type MeetingRow = {
  id: string
  code: string
  title: string
  project_id: string | null
  meeting_type: MeetingType
  status: MeetingStatus
  meeting_date: string
  start_time: string
  end_time: string
  location: string | null
  meeting_link: string | null
  organizer_id: string | null
  google_sync_status: string
  google_calendar_event_id: string | null
  /** Dibawa supaya tab Needs Notes bisa dihitung tanpa query tambahan. */
  notes: string | null
  /** Berapa action item yang sudah jadi task (T-081 dst). */
  task_count: number
  /** Action item total. */
  action_item_count: number
  /** Jumlah peserta. */
  participant_count: number
}

/**
 * Daftar meeting dalam scope, sudah equipped dengan hitungan.
 *
 * PENTING (Pelajaran Phase 10):
 * 1. Hitungan tidak diambil per-row. Setelah 1 query utama, participant +
 *    action item diambil untuk SEMUA id sekaligus lalu dihitung di memori.
 *    Kalau tidak, 20 baris = 40 query (N+1).
 * 2. Filter tab & search SENGAJA tidak diterapkan di sini — pemanggil yang
 *    menerapkannya di memori via matchesMeetingTab()/matchesMeetingSearch().
 *    Alasannya: Tabs, Results, dan KPI memanggil dengan nilai filter yang
 *    SAMA, sehingga cache() berbagi TEPAT 1 query untuk ketiganya.
 *    (Kalau tab ikut jadi bagian query, tiap tab = query berbeda.)
 */
export const fetchMeetings = cache(
  async (scope: MeetingScope, filters: MeetingFilters): Promise<MeetingRow[]> => {
    const admin = createAdminClient()

    let query = admin
      .from('meetings')
      .select(
        'id, code, title, project_id, meeting_type, status, meeting_date, start_time, end_time, location, meeting_link, organizer_id, google_sync_status, google_calendar_event_id, notes'
      )
      .order('meeting_date', { ascending: false })
      .order('start_time', { ascending: true })
      .limit(500)

    // Filter scope — SATU-SATUNYA pemakaian .or() di query ini.
    const scoped = scopeFilter(scope)
    if (scoped) query = query.or(scoped)

    // Filter yang aman di SQL (satu kolom, satu operator).
    if (filters.type) query = query.eq('meeting_type', filters.type)
    if (filters.project) query = query.eq('project_id', filters.project)
    if (filters.status) query = query.eq('status', filters.status)
    if (filters.organizer) query = query.eq('organizer_id', filters.organizer)
    if (filters.dateFrom) query = query.gte('meeting_date', filters.dateFrom)
    if (filters.dateTo) query = query.lte('meeting_date', filters.dateTo)

    const { data, error } = await query
    if (error) {
      console.error('[meetings] fetchMeetings failed:', error.message)
      return []
    }

    const rows = (data ?? []) as Omit<
      MeetingRow,
      'task_count' | 'action_item_count' | 'participant_count'
    >[]

    // Tab & search diterapkan pemanggil di memori (lihat komentar fungsi).

    if (rows.length === 0) return []

    const ids = rows.map((r) => r.id)

    const [participantsRes, actionsRes] = await Promise.all([
      admin.from('meeting_participants').select('meeting_id').in('meeting_id', ids),
      admin.from('meeting_action_items').select('meeting_id, task_id').in('meeting_id', ids),
    ])

    const participantCount = new Map<string, number>()
    for (const row of (participantsRes.data ?? []) as { meeting_id: string }[]) {
      participantCount.set(row.meeting_id, (participantCount.get(row.meeting_id) ?? 0) + 1)
    }

    const actionTotal = new Map<string, number>()
    const actionWithTask = new Map<string, number>()
    for (const row of (actionsRes.data ?? []) as {
      meeting_id: string
      task_id: string | null
    }[]) {
      actionTotal.set(row.meeting_id, (actionTotal.get(row.meeting_id) ?? 0) + 1)
      if (row.task_id) {
        actionWithTask.set(row.meeting_id, (actionWithTask.get(row.meeting_id) ?? 0) + 1)
      }
    }

    return rows.map((r) => ({
      ...r,
      participant_count: participantCount.get(r.id) ?? 0,
      action_item_count: actionTotal.get(r.id) ?? 0,
      task_count: actionWithTask.get(r.id) ?? 0,
    }))
  }
)

/* ============================================================================
 * KPI (PRD §6)
 * ============================================================================
 * Dihitung dari SATU fetch yang sama dengan daftar, supaya widget KPI tidak
 * menambah query sama sekali. Semua ikut scope user yang sama.
 */
export type MeetingKpis = {
  upcoming: number
  today: number
  needsNotes: number
  completedThisWeek: number
  openActionItems: number
  tasksCreatedThisMonth: number
  total: number
}

export const fetchMeetingKpis = cache(
  async (scope: MeetingScope, filters: MeetingFilters): Promise<MeetingKpis> => {
    const admin = createAdminClient()

    // Nilai tab & q diabaikan fetchMeetings (lihat komentarnya), jadi
    // pemanggilan ini berbagi TEPAT 1 query dengan Tabs + Results via cache().
    // Angka KPI harus stabil dan tidak ikut berubah saat user membuka tab.
    const rows = await fetchMeetings(scope, filters)

    const now = new Date()
    const parts = nowInAppTime(now)

    // Awal minggu (Senin) untuk "completed this week".
    const weekStart = shiftDate(parts.date, -weekdayIndex(parts.date))

    const ids = rows.map((r) => r.id)
    let openActionItems = 0
    let actionItemsWithTask = 0

    if (ids.length > 0) {
      const { data: actions } = await admin
        .from('meeting_action_items')
        .select('status, task_id, created_at')
        .in('meeting_id', ids)

      const monthPrefix = parts.date.slice(0, 7)
      for (const a of (actions ?? []) as {
        status: string
        task_id: string | null
        created_at: string
      }[]) {
        if (a.status === 'OPEN' || a.status === 'IN_PROGRESS') openActionItems += 1
        if (a.task_id && String(a.created_at).slice(0, 7) === monthPrefix) {
          actionItemsWithTask += 1
        }
      }
    }

    return {
      upcoming: rows.filter((r) => isMeetingUpcoming(r, now)).length,
      today: rows.filter((r) => isMeetingToday(r, now)).length,
      needsNotes: rows.filter((r) => needsNotes(r)).length,
      completedThisWeek: rows.filter(
        (r) => r.status === 'COMPLETED' && r.meeting_date >= weekStart && r.meeting_date <= parts.date
      ).length,
      openActionItems,
      tasksCreatedThisMonth: actionItemsWithTask,
      total: rows.length,
    }
  }
)

function weekdayIndex(dateISO: string): number {
  const [y, m, d] = dateISO.split('-').map(Number)
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  // Senin = 0
  return (day + 6) % 7
}

function shiftDate(dateISO: string, delta: number): string {
  const [y, m, d] = dateISO.split('-').map(Number)
  const shifted = new Date(Date.UTC(y, m - 1, d + delta))
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}-${String(
    shifted.getUTCDate()
  ).padStart(2, '0')}`
}

/**
 * Daftar project untuk dropdown filter + peta nama di kartu meeting.
 * Di-cache per request supaya dipakai bersama form filter dan hasil.
 */
export const fetchMeetingProjects = cache(async (): Promise<
  { id: string; code: string; name: string }[]
> => {
  const { data } = await createAdminClient()
    .from('projects')
    .select('id, code, name')
    .order('name', { ascending: true })
    .limit(500)
  return (data ?? []) as { id: string; code: string; name: string }[]
})

/* ============================================================================
 * DETAIL (PRD §14, §15)
 * ============================================================================ */

export type MeetingDetail = {
  id: string
  code: string
  title: string
  project_id: string | null
  meeting_type: MeetingType
  status: MeetingStatus
  meeting_date: string
  start_time: string
  end_time: string
  location: string | null
  meeting_link: string | null
  description: string | null
  notes: string | null
  organizer_id: string | null
  created_by: string | null
  google_calendar_id: string | null
  google_calendar_event_id: string | null
  google_sync_status: string
  google_sync_error: string | null
  google_last_synced_at: string | null
  add_to_calendar: boolean
  created_at: string
  updated_at: string
}

export const fetchMeetingById = cache(
  async (meetingId: string): Promise<MeetingDetail | null> => {
    const { data } = await createAdminClient()
      .from('meetings')
      .select('*')
      .eq('id', meetingId)
      .maybeSingle<MeetingDetail>()
    return data ?? null
  }
)

/**
 * Meeting + konteks yang dibutuhkan header detail (PRD §14).
 * Satu fetch paralel, bukan berantai.
 */
export const fetchMeetingHeaderContext = cache(
  async (
    meetingId: string
  ): Promise<{
    project: { id: string; code: string; name: string } | null
    organizer: { id: string; name: string } | null
    participantCount: number
    actionItemCount: number
    openActionItemCount: number
  }> => {
    const admin = createAdminClient()

    const { data: meeting } = await admin
      .from('meetings')
      .select('project_id, organizer_id')
      .eq('id', meetingId)
      .maybeSingle<{ project_id: string | null; organizer_id: string | null }>()

    const [projectRes, organizerRes, participantsRes, actionsRes] = await Promise.all([
      meeting?.project_id
        ? admin
            .from('projects')
            .select('id, code, name')
            .eq('id', meeting.project_id)
            .maybeSingle<{ id: string; code: string; name: string }>()
        : Promise.resolve({ data: null as { id: string; code: string; name: string } | null }),
      meeting?.organizer_id
        ? admin
            .from('profiles')
            .select('id, full_name, email')
            .eq('id', meeting.organizer_id)
            .maybeSingle<{ id: string; full_name: string | null; email: string }>()
        : Promise.resolve({ data: null as { id: string; full_name: string | null; email: string } | null }),
      admin.from('meeting_participants').select('id').eq('meeting_id', meetingId),
      admin.from('meeting_action_items').select('id, status').eq('meeting_id', meetingId),
    ])

    const actions = (actionsRes.data ?? []) as { id: string; status: string }[]

    return {
      project: projectRes.data ?? null,
      organizer: organizerRes.data
        ? {
            id: organizerRes.data.id,
            name: organizerRes.data.full_name || organizerRes.data.email,
          }
        : null,
      participantCount: (participantsRes.data ?? []).length,
      actionItemCount: actions.length,
      openActionItemCount: actions.filter((a) => a.status === 'OPEN' || a.status === 'IN_PROGRESS')
        .length,
    }
  }
)

/* ============================================================================
 * ISI WORKSPACE (PRD §16, §17, §18, §19)
 * ========================================================================== */

export const fetchMeetingAgenda = cache(async (meetingId: string): Promise<AgendaRow[]> => {
  const { data } = await createAdminClient()
    .from('meeting_agendas')
    .select('id, meeting_id, position, title, notes')
    .eq('meeting_id', meetingId)
    .order('position', { ascending: true })
    .order('created_at', { ascending: true })

  // status/type dijamin CHECK constraint di DB — cast langsung.
  return (data ?? []) as AgendaRow[]
})

export const fetchMeetingDecisions = cache(async (meetingId: string): Promise<DecisionRow[]> => {
  const { data } = await createAdminClient()
    .from('meeting_decisions')
    .select('id, meeting_id, position, decision, rationale, decided_by')
    .eq('meeting_id', meetingId)
    .order('position', { ascending: true })
    .order('created_at', { ascending: true })

  return (data ?? []) as DecisionRow[]
})

export const fetchMeetingActionItems = cache(async (meetingId: string): Promise<ActionItemRow[]> => {
  const { data } = await createAdminClient()
    .from('meeting_action_items')
    .select(
      'id, meeting_id, title, description, assignee_id, deadline, priority, status, task_id, created_at, updated_at'
    )
    .eq('meeting_id', meetingId)
    .order('created_at', { ascending: true })

  return (data ?? []) as ActionItemRow[]
})

/**
 * Peserta + nama untuk ditampilkan.
 * Attendee internal digabung ke profiles (1 query), jadi tidak ada N+1.
 */
export const fetchMeetingParticipants = cache(async (meetingId: string) => {
  const admin = createAdminClient()

  const { data } = await admin
    .from('meeting_participants')
    .select('id, meeting_id, user_id, external_name, external_email, attendance, is_organizer')
    .eq('meeting_id', meetingId)
    .order('is_organizer', { ascending: false })
    .order('created_at', { ascending: true })

  const rows = (data ?? []) as ParticipantRow[]

  const userIds = [...new Set(rows.map((r) => r.user_id).filter((v): v is string => Boolean(v)))]

  let names: Record<string, string> = {}
  if (userIds.length > 0) {
    const { data: profiles } = await admin
      .from('profiles')
      .select('id, full_name, email')
      .in('id', userIds)
    names = Object.fromEntries(
      ((profiles ?? []) as { id: string; full_name: string | null; email: string }[]).map((p) => [
        p.id,
        p.full_name || p.email,
      ])
    )
  }

  return rows.map((r) => ({
    ...r,
    name: r.user_id ? (names[r.user_id] ?? '-') : (r.external_name ?? r.external_email ?? '-'),
  }))
})