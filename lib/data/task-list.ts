import 'server-only'

import { cache } from 'react'
import { createAdminClient } from '@/lib/supabase/admin'
import type { TaskPriority, TaskStatus } from '@/types/task'

export type TaskRow = {
  id: string
  code: string
  title: string
  project_id: string
  workstream_id: string | null
  assignee_id: string
  priority: TaskPriority
  status: TaskStatus
  deadline: string
  created_at: string
  updated_at: string
}

export type TaskScope = {
  userId: string
  role: string
  project?: string
  workstream?: string
  priority?: string
  deadline?: string
}

/**
 * Satu fetch untuk tabs + results dalam satu request.
 * cache() mastiin TaskTabs dan TaskResults pakai hasil yang sama
 * (sebelumnya 2x query berat tiap pindah tab).
 */
export const fetchTaskRows = cache(async (scope: TaskScope): Promise<TaskRow[]> => {
  const admin = createAdminClient()

  let query = admin
    .from('tasks')
    .select('id, code, title, project_id, workstream_id, assignee_id, priority, status, deadline, created_at, updated_at')
    .eq('is_deleted', false)
    .order('deadline', { ascending: true })
    .limit(500)

  if (scope.role === 'TEAM_MEMBER') query = query.eq('assignee_id', scope.userId)
  if (scope.project) query = query.eq('project_id', scope.project)
  if (scope.workstream) query = query.eq('workstream_id', scope.workstream)
  if (scope.priority) query = query.eq('priority', scope.priority)
  if (scope.deadline === 'overdue') {
    query = query.lt('deadline', new Date().toISOString().slice(0, 10)).neq('status', 'DONE')
  } else if (scope.deadline === 'week') {
    const week = new Date()
    week.setDate(week.getDate() + 7)
    query = query
      .gte('deadline', new Date().toISOString().slice(0, 10))
      .lte('deadline', week.toISOString().slice(0, 10))
      .neq('status', 'DONE')
  }

  const { data } = await query
  return (data ?? []) as TaskRow[]
})

export type { TaskRow as TaskListRow }

export const fetchTaskLookups = cache(async (): Promise<{
  projects: { id: string; code: string; name: string }[]
  workstreams: { id: string; project_id: string; code: string; name: string }[]
  users: { id: string; full_name: string | null; email: string }[]
}> => {
  const admin = createAdminClient()
  const [projectsRes, workstreamsRes, usersRes] = await Promise.all([
    admin.from('projects').select('id, code, name').limit(500),
    admin.from('workstreams').select('id, project_id, code, name').limit(1000),
    admin.from('profiles').select('id, full_name, email').eq('status', 'ACTIVE').limit(500),
  ])
  return {
    projects: (projectsRes.data ?? []) as { id: string; code: string; name: string }[],
    workstreams: (workstreamsRes.data ?? []) as { id: string; project_id: string; code: string; name: string }[],
    users: (usersRes.data ?? []) as { id: string; full_name: string | null; email: string }[],
  }
})
