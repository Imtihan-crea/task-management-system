import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import type { LeaveKind } from '@/lib/hr/leave'
import { mergeRules, monthRange, workingDays, type CalendarDay, type LogRow, type TrackerRules } from '@/lib/hr/tracker'
import type { ReferenceList, ReferenceRow } from '@/lib/hr/reference'
import { allRows } from '@/lib/utils/paginate'

/**
 * Pembaca data HR (migrasi 021) lewat service role; pemanggil wajib sudah
 * memeriksa izin. Gagal baca (migrasi belum jalan) = default / kosong.
 */

/** Aturan yang berlaku pada tanggal itu (versi terakhir dengan effective_from <= tanggal). */
export async function loadRules(onDate: string): Promise<TrackerRules> {
  const { data, error } = await createAdminClient()
    .from('hr_settings')
    .select('rules')
    .lte('effective_from', onDate)
    .order('effective_from', { ascending: false })
    .limit(1)
    .maybeSingle<{ rules: Partial<TrackerRules> }>()
  if (error) console.warn('[hr] hr_settings read failed:', error.message)
  return mergeRules(data?.rules)
}

export async function loadCalendar(from: string, to: string): Promise<CalendarDay[]> {
  const { data, error } = await createAdminClient()
    .from('work_calendar')
    .select('day, kind, name')
    .gte('day', from)
    .lte('day', to)
  if (error) console.warn('[hr] work_calendar read failed:', error.message)
  return (data ?? []) as CalendarDay[]
}

/** Hari kerja dalam [from, to]; `month` ('YYYY-MM', hanya bila periode = satu bulan penuh) menarik juga target terkunci. */
export async function loadPeriodBasis(from: string, to: string, month: string | null): Promise<{ workdays: string[]; lockedTarget: number | null; calendar: CalendarDay[] }> {
  const [calendar, target] = await Promise.all([
    loadCalendar(from, to),
    month
      ? createAdminClient()
          .from('hr_month_targets')
          .select('target_hours')
          .eq('month', `${month}-01`)
          .maybeSingle<{ target_hours: number | string }>()
      : Promise.resolve({ data: null }),
  ])
  return {
    workdays: workingDays(from, to, calendar),
    lockedTarget: target.data ? Number(target.data.target_hours) : null,
    calendar,
  }
}

/** Hari kerja + target dikunci untuk bulan 'YYYY-MM'. */
export const loadMonthBasis = (month: string) => loadPeriodBasis(...monthRange(month), month)

/** id project -> klien (hanya yang terisi). */
export async function loadProjectClients(): Promise<Map<string, string>> {
  const rows = await allRows<{ id: string; client: string | null }>((f, t) =>
    createAdminClient().from('projects').select('id, client').not('client', 'is', null).order('id').range(f, t)
  )
  return new Map(rows.filter((r) => r.client?.trim()).map((r) => [r.id, r.client!.trim()]))
}

/** Semua pilihan Master Reference (termasuk arsip), urut daftar lalu urutan. */
export async function loadReferences(lists?: ReferenceList[]): Promise<ReferenceRow[]> {
  let q = createAdminClient()
    .from('master_references')
    .select('id, list, code, label, description, sort_order, archived_at')
    .order('list')
    .order('sort_order')
  if (lists) q = q.in('list', lists)
  const { data, error } = await q
  if (error) console.warn('[hr] master_references read failed:', error.message)
  return (data ?? []) as ReferenceRow[]
}

export type TrackerProject = { id: string; name: string }

/** Project TMS untuk pilihan proyek tracker: yang belum selesai/batal (nama saja). */
export async function loadTrackerProjects(): Promise<TrackerProject[]> {
  const { data } = await createAdminClient()
    .from('projects')
    .select('id, name')
    .in('status', ['PLANNING', 'ACTIVE', 'ON_HOLD'])
    .order('name')
  return (data ?? []) as TrackerProject[]
}

type RawLog = LogRow & {
  project_id: string | null
  internal_project_ref: string | null
  category_ref: string | null
}

/**
 * Semua work_logs dalam rentang (dibaca per 1000 baris, batas PostgREST).
 * Nama proyek/kategori memakai label master terkini bila entri tertaut ke
 * pilihan master; teks bebas diberi tanda supaya terlihat di rekap.
 */
export async function loadLogs(from: string, to: string, userIds?: string[]): Promise<LogRow[]> {
  const admin = createAdminClient()
  const [refList, clients] = await Promise.all([loadReferences(['ACTIVITY_CATEGORY', 'INTERNAL_PROJECT']), loadProjectClients()])
  const refs = new Map(refList.map((r) => [r.id, r.label]))
  const out: LogRow[] = []
  for (let offset = 0; ; offset += 1000) {
    let q = admin
      .from('work_logs')
      .select('user_id, work_date, project_id, project_name, internal_project_ref, category, category_ref, duration_minutes')
      .gte('work_date', from)
      .lte('work_date', to)
      .order('id')
      .range(offset, offset + 999)
    if (userIds) q = q.in('user_id', userIds.length ? userIds : ['00000000-0000-0000-0000-000000000000'])
    const { data, error } = await q
    if (error) {
      console.error('[hr] work_logs read failed:', error.message)
      throw new Error('Gagal membaca data tracker.')
    }
    for (const r of (data ?? []) as RawLog[]) {
      out.push({
        user_id: r.user_id,
        work_date: r.work_date,
        duration_minutes: r.duration_minutes,
        client: r.project_id ? clients.get(r.project_id) ?? null : null,
        project_name: r.project_id
          ? r.project_name
          : r.internal_project_ref
            ? refs.get(r.internal_project_ref) ?? r.project_name
            : r.project_name,
        category: r.category_ref ? refs.get(r.category_ref) ?? r.category : r.category,
      })
    }
    if (!data || data.length < 1000) return out
  }
}

export type LogComment = { id: string; work_log_id: string; body: string; created_at: string; author: string }

/** Komentar pemeriksa untuk sekumpulan aktivitas, dengan nama penulis. */
export async function loadComments(logIds: string[]): Promise<Map<string, LogComment[]>> {
  const out = new Map<string, LogComment[]>()
  const data: unknown[] = []
  // Per 200 id: daftar id panjang di URL bisa melewati batas panjang URL (review 16 Nov 2026).
  for (let i = 0; i < logIds.length; i += 200) {
    const res = await createAdminClient()
      .from('work_log_comments')
      .select('id, work_log_id, body, created_at, author:profiles!work_log_comments_author_id_fkey(full_name, email)')
      .in('work_log_id', logIds.slice(i, i + 200))
      .order('created_at')
    if (res.error) {
      console.error('[hr] comments read failed:', res.error.message)
      throw new Error('Gagal membaca komentar.')
    }
    data.push(...(res.data ?? []))
  }
  for (const c of data as unknown as (Omit<LogComment, 'author'> & { author: { full_name: string | null; email: string } | null })[]) {
    const item = { ...c, author: c.author?.full_name || c.author?.email || '-' }
    out.set(c.work_log_id, [...(out.get(c.work_log_id) ?? []), item])
  }
  return out
}

export type ReviewLog = {
  id: string
  user_id: string
  person: string
  work_date: string
  start_time: string
  end_time: string
  duration_minutes: number
  project: string
  activity: string
  detail: string | null
  category: string
  output: string | null
  location: string | null
  client: string | null
}

/**
 * Aktivitas untuk pemeriksa (PM View / rekap HR): per project atau per orang,
 * label master terkini, nama orang. Dibaca per 1000 baris (batas PostgREST).
 */
export async function loadReviewLogs(filter: { projectId?: string; userId?: string; from: string; to: string }): Promise<ReviewLog[]> {
  const page = (from: number, to: number) => {
    let q = createAdminClient()
      .from('work_logs')
      .select('id, user_id, work_date, start_time, end_time, duration_minutes, project_id, project_name, internal_project_ref, activity, detail, category, category_ref, output, location, location_ref, person:profiles!work_logs_user_id_fkey(full_name, email)')
      .gte('work_date', filter.from)
      .lte('work_date', filter.to)
      .order('work_date', { ascending: false })
      .order('start_time')
      .order('id')
      .range(from, to)
    if (filter.projectId) q = q.eq('project_id', filter.projectId)
    if (filter.userId) q = q.eq('user_id', filter.userId)
    return q
  }
  const [data, refs, clients] = await Promise.all([allRows<unknown>(page), loadReferences(['ACTIVITY_CATEGORY', 'INTERNAL_PROJECT', 'WORK_LOCATION']), loadProjectClients()])
  const label = new Map(refs.map((r) => [r.id, r.label]))
  type Raw = Omit<ReviewLog, 'person' | 'project' | 'client'> & {
    project_id: string | null
    project_name: string
    internal_project_ref: string | null
    category_ref: string | null
    location_ref: string | null
    person: { full_name: string | null; email: string } | null
  }
  return ((data ?? []) as unknown as Raw[]).map((r) => ({
    id: r.id,
    user_id: r.user_id,
    person: r.person?.full_name || r.person?.email || '-',
    work_date: r.work_date,
    start_time: r.start_time,
    end_time: r.end_time,
    duration_minutes: r.duration_minutes,
    project: r.project_id ? r.project_name : r.internal_project_ref ? label.get(r.internal_project_ref) ?? r.project_name : r.project_name,
    activity: r.activity,
    detail: r.detail,
    category: r.category_ref ? label.get(r.category_ref) ?? r.category : r.category,
    output: r.output,
    client: r.project_id ? clients.get(r.project_id) ?? null : null,
    location: r.location_ref ? label.get(r.location_ref) ?? r.location : r.location,
  }))
}

export type LeaveRecord = {
  id: string
  user_id: string
  kind: LeaveKind
  special_reason: string | null
  start_date: string
  end_date: string
  days: number
  reason: string | null
  attachment_url: string | null
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED'
  decided_by: string | null
  decided_at: string | null
  decision_note: string | null
  source: string
  created_at: string
}

/** Pengajuan cuti yang menyentuh rentang [from, to] (opsional per user / status). */
export async function loadLeave(filter: { from: string; to: string; userId?: string; statuses?: string[] }): Promise<LeaveRecord[]> {
  return allRows<LeaveRecord>((f, t) => {
    let q = createAdminClient()
      .from('leave_requests')
      .select('id, user_id, kind, special_reason, start_date, end_date, days, reason, attachment_url, status, decided_by, decided_at, decision_note, source, created_at')
      .lte('start_date', filter.to)
      .gte('end_date', filter.from)
      .order('start_date', { ascending: false })
      .order('id')
      .range(f, t)
    if (filter.userId) q = q.eq('user_id', filter.userId)
    if (filter.statuses) q = q.in('status', filter.statuses)
    return q
  })
}
