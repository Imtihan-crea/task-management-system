import 'server-only'

import { cache } from 'react'
import { createAdminClient } from '@/lib/supabase/admin'
import type { TaskPriority, TaskStatus } from '@/types/task'
// Bentuk baris DITURUNKAN dari skema Drizzle (single source of truth),
// bukan ditulis manual. Kalau nama kolom di database berubah atau dihapus,
// file ini langsung gagal compile — bukan gagal saat user klik.
import type { Profile, Project, Task, Workstream } from '@/lib/db'

/** Assignee yang di-embed (PostgREST embed) pada query task. */
export type TaskAssignee = Pick<Profile, 'id' | 'full_name' | 'email'>

/** Kolom task yang diambil pada query list. */
type TaskColumns = Pick<
  Task,
  | 'id'
  | 'code'
  | 'title'
  | 'project_id'
  | 'workstream_id'
  | 'assignee_id'
  | 'priority'
  | 'status'
  | 'deadline'
  | 'completed_at'
  | 'cancelled_at'
  | 'created_at'
  | 'updated_at'
>

export type TaskRow = Omit<TaskColumns, 'priority' | 'status'> & {
  // Persempit ke union enum (lebih ketat daripada `text` di database).
  priority: TaskPriority
  status: TaskStatus
  // Hasil embed PostgREST, bukan kolom fisik.
  assignee: TaskAssignee | null
}

export type TaskScope = {
  userId: string
  role: string
  project?: string
  workstream?: string
  priority?: string
  deadline?: string
}

/** Kolom task + embed assignee dalam satu request. */
const TASK_SELECT =
  'id, code, title, project_id, workstream_id, assignee_id, ' +
  'assignee:profiles!tasks_assignee_id_fkey(id, full_name, email), ' +
  'priority, status, deadline, completed_at, cancelled_at, created_at, updated_at'

/** Nama tampilan assignee: nama lengkap, fallback ke email. */
export function assigneeName(a: TaskAssignee | null | undefined): string {
  if (!a) return ''
  return a.full_name || a.email
}

/**
 * Satu fetch untuk tabs + results dalam satu request.
 * cache() mastiin TaskTabs dan TaskResults pakai hasil yang sama
 * (sebelumnya 2x query berat tiap pindah tab).
 * Assignee di-embed supaya tidak perlu query profiles terpisah (waterfall).
 */
export const fetchTaskRows = cache(async (scope: TaskScope): Promise<TaskRow[]> => {
  const admin = createAdminClient()

  let query = admin
    .from('tasks')
    .select(TASK_SELECT)
    .eq('is_deleted', false)
    .order('deadline', { ascending: true })
    .limit(500)

  if (scope.role === 'TEAM_MEMBER') query = query.eq('assignee_id', scope.userId)
  if (scope.project) query = query.eq('project_id', scope.project)
  if (scope.workstream) query = query.eq('workstream_id', scope.workstream)
  if (scope.priority) query = query.eq('priority', scope.priority)
  if (scope.deadline === 'overdue') {
    query = query
      .lt('deadline', new Date().toISOString().slice(0, 10))
      .neq('status', 'DONE')
      .neq('status', 'CANCELLED')
  } else if (scope.deadline === 'week') {
    const week = new Date()
    week.setDate(week.getDate() + 7)
    query = query
      .gte('deadline', new Date().toISOString().slice(0, 10))
      .lte('deadline', week.toISOString().slice(0, 10))
      .neq('status', 'DONE')
      .neq('status', 'CANCELLED')
  }

  const { data } = await query
  // Select string berisi embed PostgREST, jadi tipenya tidak bisa
  // di-infer otomatis oleh supabase-js -> cast lewat unknown.
  return (data ?? []) as unknown as TaskRow[]
})

export type { TaskRow as TaskListRow }

export type TaskLookups = {
  projects: Pick<Project, 'id' | 'code' | 'name'>[]
  workstreams: Pick<Workstream, 'id' | 'project_id' | 'code' | 'name'>[]
}

/**
 * Lookup bersama untuk dropdown filter + peta nama (projects/workstreams).
 * cache() => 2 query ini dipakai ulang oleh halaman /tasks (form filter)
 * DAN oleh hasil task, bukan diulang di tiap tempat.
 * Catatan: profiles TIDAK diambil di sini — nama assignee sekarang ikut
 * embed pada fetchTaskRows/getDashboardTasks (0 query tambahan).
 */
export const fetchTaskLookups = cache(async (): Promise<TaskLookups> => {
  const admin = createAdminClient()
  const [projectsRes, workstreamsRes] = await Promise.all([
    admin.from('projects').select('id, code, name').limit(500),
    admin.from('workstreams').select('id, project_id, code, name').limit(1000),
  ])
  return {
    projects: (projectsRes.data ?? []) as TaskLookups['projects'],
    workstreams: (workstreamsRes.data ?? []) as TaskLookups['workstreams'],
  }
})