'use client'

import { useActionState, useState } from 'react'
import { createTask, updateTask, type TaskFormState } from '@/app/actions/tasks'
import { TASK_PRIORITIES, TASK_STATUSES } from '@/lib/auth/roles'
import { displayName, type UserOption } from '@/lib/data/user-options'
import type { TaskPriority, TaskStatus } from '@/types/task'

const INITIAL: TaskFormState = undefined

export type ProjectOption = { id: string; name: string }
export type WorkstreamOption = { id: string; project_id: string; name: string }

export type TaskFormValues = {
  id?: string
  title?: string
  description?: string | null
  project_id?: string
  workstream_id?: string | null
  assignee_id?: string
  priority?: TaskPriority
  status?: TaskStatus
  start_date?: string | null
  deadline?: string | null
}

export function TaskForm({
  mode,
  projects,
  workstreams,
  users,
  initial,
}: {
  mode: 'create' | 'edit'
  projects: ProjectOption[]
  workstreams: WorkstreamOption[]
  users: UserOption[]
  initial?: TaskFormValues
}) {
  const action = mode === 'create' ? createTask : updateTask
  const [state, formAction, pending] = useActionState(action, INITIAL)
  const values = initial ?? {}

  const [projectId, setProjectId] = useState(values.project_id ?? '')
  const filteredWorkstreams = workstreams.filter((w) => w.project_id === projectId)

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {values.id && <input type="hidden" name="id" value={values.id} />}

      <div>
        <label htmlFor="task_title" className="mb-1 block text-sm font-medium">
          Task Name <span aria-hidden="true">*</span>
        </label>
        <input
          id="task_title"
          name="title"
          required
          maxLength={200}
          defaultValue={values.title ?? ''}
          placeholder="Nama task"
          className="w-full rounded-lg border px-3 py-2 text-base outline-none focus:border-black dark:border-zinc-700 dark:bg-zinc-800"
        />
      </div>

      <div>
        <label htmlFor="task_desc" className="mb-1 block text-sm font-medium">
          Description
        </label>
        <textarea
          id="task_desc"
          name="description"
          rows={3}
          defaultValue={values.description ?? ''}
          placeholder="Deskripsi (opsional)"
          className="w-full rounded-lg border px-3 py-2 text-base outline-none focus:border-black dark:border-zinc-700 dark:bg-zinc-800"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="task_project" className="mb-1 block text-sm font-medium">
            Project <span aria-hidden="true">*</span>
          </label>
          <select
            id="task_project"
            name="project_id"
            required
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="min-h-[44px] w-full rounded-lg border px-3 py-2 text-base dark:border-zinc-700 dark:bg-zinc-800"
          >
            <option value="">— Pilih —</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="task_ws" className="mb-1 block text-sm font-medium">
            Workstream
          </label>
          <select
            id="task_ws"
            name="workstream_id"
            defaultValue={values.workstream_id ?? ''}
            className="min-h-[44px] w-full rounded-lg border px-3 py-2 text-base dark:border-zinc-700 dark:bg-zinc-800"
          >
            <option value="">— None —</option>
            {filteredWorkstreams.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label htmlFor="task_assignee" className="mb-1 block text-sm font-medium">
          Assignee <span aria-hidden="true">*</span>
        </label>
        <select
          id="task_assignee"
          name="assignee_id"
          required
          defaultValue={values.assignee_id ?? ''}
          className="min-h-[44px] w-full rounded-lg border px-3 py-2 text-base dark:border-zinc-700 dark:bg-zinc-800"
        >
          <option value="">— Pilih —</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {displayName(u)} ({u.email})
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="task_priority" className="mb-1 block text-sm font-medium">
            Priority <span aria-hidden="true">*</span>
          </label>
          <select
            id="task_priority"
            name="priority"
            defaultValue={values.priority ?? 'MEDIUM'}
            className="min-h-[44px] w-full rounded-lg border px-3 py-2 text-base dark:border-zinc-700 dark:bg-zinc-800"
          >
            {TASK_PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="task_status" className="mb-1 block text-sm font-medium">
            Status <span aria-hidden="true">*</span>
          </label>
          <select
            id="task_status"
            name="status"
            defaultValue={values.status ?? 'TODO'}
            className="min-h-[44px] w-full rounded-lg border px-3 py-2 text-base dark:border-zinc-700 dark:bg-zinc-800"
          >
            {TASK_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.replace('_', ' ')}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="task_start" className="mb-1 block text-sm font-medium">
            Start Date
          </label>
          <input
            id="task_start"
            name="start_date"
            type="date"
            defaultValue={values.start_date ?? ''}
            className="min-h-[44px] w-full rounded-lg border px-3 py-2 text-base dark:border-zinc-700 dark:bg-zinc-800"
          />
        </div>
        <div>
          <label htmlFor="task_deadline" className="mb-1 block text-sm font-medium">
            Deadline <span aria-hidden="true">*</span>
          </label>
          <input
            id="task_deadline"
            name="deadline"
            type="date"
            required
            defaultValue={values.deadline ?? ''}
            className="min-h-[44px] w-full rounded-lg border px-3 py-2 text-base dark:border-zinc-700 dark:bg-zinc-800"
          />
        </div>
      </div>

      {state?.error && (
        <p role="alert" className="text-sm font-medium text-red-600">
          {state.error}
        </p>
      )}
      {state?.success && (
        <p role="status" className="text-sm font-medium text-green-600">
          {state.success}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="min-h-[44px] w-full rounded-lg bg-black px-4 py-2 font-semibold text-white disabled:opacity-50 sm:w-auto dark:bg-white dark:text-black"
      >
        {pending ? 'Saving...' : mode === 'create' ? 'Create Task' : 'Save Changes'}
      </button>
    </form>
  )
}
