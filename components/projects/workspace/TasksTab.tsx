import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import { PriorityBadge, TaskStatusBadge, OverdueBadge } from '@/components/ui/Badges'
import { showsOverdueBadge } from '@/lib/utils/dates'
import type { TaskStatus } from '@/types/task'

type TaskRow = {
  id: string
  code: string
  title: string
  workstream_id: string | null
  assignee_id: string
  priority: 'LOW' | 'MEDIUM' | 'HIGH'
  status: TaskStatus
  deadline: string
  completed_at: string | null
  cancelled_at: string | null
}

export async function TasksTab({
  projectId,
  canCreate,
  filters,
}: {
  projectId: string
  canCreate: boolean
  filters: { ws: string; status: string; priority: string }
}) {
  const admin = createAdminClient()

  const [{ data: workstreams }, { data: tasks }] = await Promise.all([
    admin
      .from('workstreams')
      .select('id, code, name')
      .eq('project_id', projectId)
      .order('created_at', { ascending: true }),
    admin
      .from('tasks')
      .select('id, code, title, workstream_id, assignee_id, priority, status, deadline, completed_at, cancelled_at')
      .eq('project_id', projectId)
      .eq('is_deleted', false)
      .order('deadline', { ascending: true })
      .limit(500),
  ])

  const wsList = (workstreams ?? []) as { id: string; code: string; name: string }[]
  const wsNames = Object.fromEntries(wsList.map((w) => [w.id, `${w.code} · ${w.name}`]))

  const assigneeIds = [...new Set(((tasks ?? []) as TaskRow[]).map((t) => t.assignee_id))]
  let assigneeNames: Record<string, string> = {}
  if (assigneeIds.length > 0) {
    const { data: users } = await admin
      .from('profiles')
      .select('id, full_name, email')
      .in('id', assigneeIds)
    assigneeNames = Object.fromEntries(
      ((users ?? []) as { id: string; full_name: string | null; email: string }[]).map((u) => [
        u.id,
        u.full_name || u.email,
      ])
    )
  }

  const visibleTasks = ((tasks ?? []) as TaskRow[])
    .filter(
      (t) =>
        (!filters.ws || t.workstream_id === filters.ws) &&
        (!filters.status || t.status === filters.status) &&
        (!filters.priority || t.priority === filters.priority)
    )
    .sort((a, b) => {
      const aClosed = a.status === 'DONE' || a.status === 'CANCELLED' ? 1 : 0
      const bClosed = b.status === 'DONE' || b.status === 'CANCELLED' ? 1 : 0
      if (aClosed !== bClosed) return aClosed - bClosed
      return a.deadline < b.deadline ? -1 : a.deadline > b.deadline ? 1 : 0
    })

  return (
    <section className="rounded-2xl bg-white p-5 shadow dark:bg-zinc-900">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold">Tasks ({visibleTasks.length})</h2>
        {canCreate && (
          <Link
            href={`/tasks/new?project=${projectId}`}
            className="inline-flex min-h-[44px] items-center rounded-lg bg-kasuat-gold px-4 py-2 text-sm font-semibold text-kasuat-black"
          >
            + Add Task
          </Link>
        )}
      </div>

      <form method="get" className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
        <input type="hidden" name="tab" value="tasks" />
        <div>
          <label htmlFor="fws" className="mb-1 block text-xs font-medium">
            Workstream
          </label>
          <select
            id="fws"
            name="ws"
            defaultValue={filters.ws}
            className="min-h-[44px] rounded-lg border px-2 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
          >
            <option value="">All</option>
            {wsList.map((w) => (
              <option key={w.id} value={w.id}>
                {w.code} · {w.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="fstatus" className="mb-1 block text-xs font-medium">
            Status
          </label>
          <select
            id="fstatus"
            name="status"
            defaultValue={filters.status}
            className="min-h-[44px] rounded-lg border px-2 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
          >
            <option value="">All</option>
            {(['TODO', 'IN_PROGRESS', 'REVIEW', 'BLOCKED', 'DONE', 'CANCELLED'] as const).map((s) => (
              <option key={s} value={s}>
                {s.replace('_', ' ')}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="fpriority" className="mb-1 block text-xs font-medium">
            Priority
          </label>
          <select
            id="fpriority"
            name="priority"
            defaultValue={filters.priority}
            className="min-h-[44px] rounded-lg border px-2 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
          >
            <option value="">All</option>
            {(['LOW', 'MEDIUM', 'HIGH'] as const).map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="min-h-[44px] rounded-lg border px-4 py-2 text-sm font-semibold"
        >
          Filter
        </button>
      </form>

      {visibleTasks.length === 0 ? (
        <p className="mt-3 text-sm text-zinc-500">No tasks yet.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {visibleTasks.map((task) => (
            <li key={task.id}>
              <Link
                href={`/tasks/${task.id}`}
                className="flex flex-col gap-1 rounded-xl border p-3 hover:bg-zinc-50 sm:flex-row sm:items-center sm:justify-between dark:border-zinc-700 dark:hover:bg-zinc-800"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    <span className="mr-2 rounded-md bg-zinc-100 px-1.5 py-0.5 font-mono text-xs dark:bg-zinc-800">
                      {task.code}
                    </span>
                    {task.title}
                  </p>
                  <p className="truncate text-xs text-zinc-500">
                    {task.workstream_id ? (wsNames[task.workstream_id] ?? '-') : 'No workstream'}
                    {' '} &middot; {assigneeNames[task.assignee_id] ?? '-'}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <PriorityBadge priority={task.priority} />
                  <TaskStatusBadge status={task.status} />
                  {showsOverdueBadge(task.deadline, task.status, task.completed_at, task.cancelled_at) && <OverdueBadge />}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
