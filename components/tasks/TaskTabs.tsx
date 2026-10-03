import { createAdminClient } from '@/lib/supabase/admin'
import { isOverdue } from '@/lib/utils/dates'
import { Tabs } from '@/components/ui/Tabs'
import type { TaskStatus } from '@/types/task'

export type TaskTabKey = 'all' | 'mine' | 'ongoing' | 'todo' | 'blocked' | 'done' | 'overdue'

const TAB_DEFS: { key: TaskTabKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'mine', label: 'My Tasks' },
  { key: 'ongoing', label: 'On Going' },
  { key: 'todo', label: 'To Do' },
  { key: 'blocked', label: 'Blocked' },
  { key: 'done', label: 'Done' },
  { key: 'overdue', label: 'Overdue' },
]

/** Tab aktif dari ?view=. Default 'all' (§10). */
export function parseTaskTab(view: string): TaskTabKey {
  const map: Record<string, TaskTabKey> = {
    mine: 'mine',
    my: 'mine',
    ongoing: 'ongoing',
    'on-going': 'ongoing',
    todo: 'todo',
    blocked: 'blocked',
    done: 'done',
    overdue: 'overdue',
  }
  return map[view] ?? 'all'
}

type ScopeInput = {
  userId: string
  role: string
  projectId?: string
  workstreamId?: string
  priority?: string
  deadline?: string
}

function matchesTab(
  t: { assignee_id: string; status: TaskStatus; deadline: string },
  tab: TaskTabKey,
  userId: string
): boolean {
  switch (tab) {
    case 'mine':
      return t.assignee_id === userId
    case 'ongoing':
      return t.status === 'IN_PROGRESS'
    case 'todo':
      return t.status === 'TODO'
    case 'blocked':
      return t.status === 'BLOCKED'
    case 'done':
      return t.status === 'DONE'
    case 'overdue':
      return isOverdue(t.deadline, t.status)
    default:
      return true
  }
}

/**
 * Tabs dengan counts akurat dari dataset yang sama dengan results.
 * Satu fetch, counts + filter konsisten.
 */
export async function TaskTabs({
  scope,
  tab,
  userId,
  baseParams,
}: {
  scope: ScopeInput
  tab: TaskTabKey
  userId: string
  baseParams: Record<string, string>
}) {
  const admin = createAdminClient()

  let query = admin
    .from('tasks')
    .select('assignee_id, status, deadline')
    .eq('is_deleted', false)
    .limit(2000)

  if (scope.role === 'TEAM_MEMBER') query = query.eq('assignee_id', scope.userId)
  if (scope.projectId) query = query.eq('project_id', scope.projectId)
  if (scope.workstreamId) query = query.eq('workstream_id', scope.workstreamId)
  if (scope.priority) query = query.eq('priority', scope.priority)
  if (scope.deadline === 'overdue') query = query.lt('deadline', new Date().toISOString().slice(0, 10)).neq('status', 'DONE')
  else if (scope.deadline === 'week') {
    const week = new Date()
    week.setDate(week.getDate() + 7)
    query = query
      .gte('deadline', new Date().toISOString().slice(0, 10))
      .lte('deadline', week.toISOString().slice(0, 10))
      .neq('status', 'DONE')
  }

  const { data } = await query
  const rows = (data ?? []) as { assignee_id: string; status: TaskStatus; deadline: string }[]

  const href = (key: TaskTabKey) => {
    const params = new URLSearchParams(baseParams)
    if (key === 'all') params.delete('view')
    else params.set('view', key === 'mine' ? 'mine' : key)
    params.delete('page')
    const s = params.toString()
    return s ? `/tasks?${s}` : '/tasks'
  }

  return (
    <Tabs
      label="Task views"
      items={TAB_DEFS.map((def) => ({
        key: def.key,
        label: def.label,
        count: rows.filter((t) => matchesTab(t, def.key, userId)).length,
        href: href(def.key),
        active: tab === def.key,
      }))}
    />
  )
}

export function applyTaskTab<T extends { assignee_id: string; status: TaskStatus; deadline: string }>(
  tasks: T[],
  tab: TaskTabKey,
  userId: string
): T[] {
  return tasks.filter((t) => matchesTab(t, tab, userId))
}
