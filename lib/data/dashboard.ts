import 'server-only'

import { cache } from 'react'
import { createAdminClient } from '@/lib/supabase/admin'
import type { TaskRow } from '@/lib/data/task-list'

/** Sama seperti fetchTaskRows: assignee di-embed, tanpa query profiles terpisah. */
const DASHBOARD_TASK_SELECT =
  'id, code, title, project_id, workstream_id, assignee_id, ' +
  'assignee:profiles!tasks_assignee_id_fkey(id, full_name, email), ' +
  'priority, status, deadline, created_at, updated_at'

export type DashboardScope = {
  projectIds: string[] | null // null = semua
  taskAssignee: string | null // null = semua assignee
}

export type DashboardFilters = {
  project: string
  assignee: string
  status: string
  priority: string
}

/**
 * Scope per role (sama seperti sebelumnya). Di-cache per request
 * supaya semua section dashboard pakai hasil yang sama.
 */
export const getDashboardScope = cache(
  async (userId: string, role: string): Promise<DashboardScope> => {
    const admin = createAdminClient()

    if (role === 'PROJECT_MANAGER') {
      const { data: links } = await admin
        .from('project_managers')
        .select('project_id')
        .eq('user_id', userId)
      return {
        projectIds: ((links ?? []) as { project_id: string }[]).map((l) => l.project_id),
        taskAssignee: null,
      }
    }

    if (role === 'TEAM_MEMBER') {
      const { data: myTasks } = await admin
        .from('tasks')
        .select('project_id')
        .eq('assignee_id', userId)
        .eq('is_deleted', false)
        .limit(1000)
      return {
        projectIds: [
          ...new Set(((myTasks ?? []) as { project_id: string }[]).map((t) => t.project_id)),
        ],
        taskAssignee: userId,
      }
    }

    return { projectIds: null, taskAssignee: null }
  }
)

/** Daftar project dalam scope (untuk KPI, filter, gantt). */
export const getDashboardProjects = cache(
  async (
    userId: string,
    role: string,
    fProject: string
  ): Promise<{ id: string; code: string; name: string; status: string; created_at: string }[]> => {
    const admin = createAdminClient()
    const scope = await getDashboardScope(userId, role)

    let q = admin
      .from('projects')
      .select('id, code, name, status, created_at')
      .order('created_at', { ascending: false })
      .limit(500)

    if (scope.projectIds !== null) {
      q =
        scope.projectIds.length > 0
          ? q.in('id', scope.projectIds)
          : q.eq('id', '00000000-0000-0000-0000-000000000000')
    }
    if (fProject) q = q.eq('id', fProject)

    const { data } = await q
    return (data ?? []) as { id: string; code: string; name: string; status: string; created_at: string }[]
  }
)

/** Daftar task dalam scope + filter (untuk KPI, chart, list). */
export const getDashboardTasks = cache(
  async (
    userId: string,
    role: string,
    f: DashboardFilters
  ): Promise<TaskRow[]> => {
    const admin = createAdminClient()
    const scope = await getDashboardScope(userId, role)

    let q = admin
      .from('tasks')
      .select(DASHBOARD_TASK_SELECT)
      .eq('is_deleted', false)
      .order('deadline', { ascending: true })
      .limit(2000)

    if (scope.projectIds !== null) {
      q =
        scope.projectIds.length > 0
          ? q.in('project_id', scope.projectIds)
          : q.eq('project_id', '00000000-0000-0000-0000-000000000000')
    }
    if (scope.taskAssignee) q = q.eq('assignee_id', scope.taskAssignee)
    if (f.project) q = q.eq('project_id', f.project)
    if (f.assignee && !scope.taskAssignee) q = q.eq('assignee_id', f.assignee)
    if (f.status) q = q.eq('status', f.status)
    if (f.priority) q = q.eq('priority', f.priority)

    const { data } = await q
    // Sama seperti fetchTaskRows: cast lewat unknown karena select string
    // berisi embed PostgREST yang tidak bisa di-infer.
    return (data ?? []) as unknown as TaskRow[]
  }
)
