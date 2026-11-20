import 'server-only'

import { applyTaskTab, type TaskTabKey } from '@/components/tasks/TaskTabs'
import { assigneeName, fetchTaskLookups, fetchTaskRows, type TaskRow } from '@/lib/data/task-list'
import { daysFromTodayISO, isOverdue, todayISO } from '@/lib/utils/dates'
import type { TaskPriority } from '@/types/task'

const PRIORITY_RANK: Record<TaskPriority, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 }

export type TaskFilters = {
  q: string
  tab: TaskTabKey
  userId: string
  role: string
  project: string
  workstream: string
  status: string
  priority: string
  deadline: string
  sort: string
  page: number
}

export type TaskResultsData = {
  /** Sebelum q/tab/status; dipakai untuk membedakan "kosong" dan "tak cocok". */
  allTasks: TaskRow[]
  /** Sesudah semua filter dan urutan, belum dipaginasi. */
  tasks: TaskRow[]
  projectNames: Record<string, string>
  workstreamNames: Record<string, string>
  assigneeNames: Record<string, string>
}

/**
 * Fetch + filter + urutan daftar task (sebelum paginasi). Dipakai halaman /tasks
 * DAN export Excel supaya cakupan data dan filter identik.
 */
export async function loadTaskResults(filters: TaskFilters): Promise<TaskResultsData> {
  const { q, tab, userId, role, sort } = filters

  const [allTasks, lookups] = await Promise.all([
    fetchTaskRows({
      userId,
      role,
      project: filters.project,
      workstream: filters.workstream,
      priority: filters.priority,
      deadline: filters.deadline,
    }),
    fetchTaskLookups(),
  ])
  let tasks = allTasks

  const projectNames = Object.fromEntries(lookups.projects.map((p) => [p.id, `${p.code} · ${p.name}`]))
  const workstreamNames = Object.fromEntries(lookups.workstreams.map((w) => [w.id, `${w.code} · ${w.name}`]))

  // Nama assignee sudah ikut embed di fetchTaskRows -> 0 query tambahan.
  const assigneeNames: Record<string, string> = Object.fromEntries(
    tasks.filter((t) => assigneeName(t.assignee)).map((t) => [t.assignee_id, assigneeName(t.assignee)])
  )

  const needle = q.toLowerCase()
  if (needle) {
    tasks = tasks.filter(
      (t) =>
        t.code.toLowerCase().startsWith(needle) ||
        t.title.toLowerCase().includes(needle) ||
        (projectNames[t.project_id] ?? '').toLowerCase().includes(needle) ||
        (assigneeNames[t.assignee_id] ?? '').toLowerCase().includes(needle)
    )
  }

  // Tab + dropdown status digabung (AND).
  tasks = applyTaskTab(tasks, tab, userId)
  if (filters.status) tasks = tasks.filter((t) => t.status === filters.status)

  if (filters.deadline === 'overdue') {
    tasks = tasks.filter((t) => isOverdue(t.deadline, t.status))
  } else if (filters.deadline === 'week') {
    const weekISO = daysFromTodayISO(7)
    tasks = tasks.filter(
      (t) =>
        t.deadline >= todayISO() &&
        t.deadline <= weekISO &&
        t.status !== 'DONE' &&
        t.status !== 'CANCELLED' &&
        t.status !== 'REVIEW'
    )
  }

  if (sort === 'priority') {
    tasks = [...tasks].sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority])
  }
  if (sort === 'deadline.asc' || sort === 'deadline.desc') {
    const desc = sort === 'deadline.desc'
    tasks = [...tasks].sort((a, b) => {
      // Terminal (DONE/CANCELLED) selalu di bawah, seperti sebelumnya.
      const aClosed = a.status === 'DONE' || a.status === 'CANCELLED' ? 1 : 0
      const bClosed = b.status === 'DONE' || b.status === 'CANCELLED' ? 1 : 0
      if (aClosed !== bClosed) return aClosed - bClosed
      if (a.deadline === b.deadline) return 0
      return desc ? (a.deadline < b.deadline ? 1 : -1) : a.deadline < b.deadline ? -1 : 1
    })
  }

  return { allTasks, tasks, projectNames, workstreamNames, assigneeNames }
}

/** Kata cari aman untuk filter PostgREST .or() (dipakai halaman /tasks dan export). */
export function sanitizeTaskSearch(value: string | undefined): string {
  return (value ?? '').replace(/[,()*%]/g, ' ').trim().slice(0, 60)
}

/** Param URL /tasks -> filter (sama dengan app/(app)/tasks/page.tsx); export tidak dipaginasi. */
export function parseTaskFilters(
  sp: URLSearchParams,
  viewer: { userId: string; role: string },
  parseTab: (v: string) => TaskTabKey
): TaskFilters {
  const get = (k: string) => sp.get(k) ?? ''
  return {
    q: sanitizeTaskSearch(get('q')),
    tab: parseTab(get('view')),
    userId: viewer.userId,
    role: viewer.role,
    project: get('project'),
    workstream: get('workstream'),
    status: get('status'),
    priority: get('priority'),
    deadline: get('deadline'),
    sort: get('sort') || 'deadline.asc',
    page: 1,
  }
}
