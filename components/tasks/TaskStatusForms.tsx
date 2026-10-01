'use client'

import { useActionState } from 'react'
import {
  changeTaskStatus,
  deleteTask,
  type TaskFormState,
} from '@/app/actions/tasks'
import { TASK_STATUSES } from '@/lib/auth/roles'
import type { TaskStatus } from '@/types/task'

const INITIAL: TaskFormState = undefined

export function ChangeStatusForm({
  id,
  current,
}: {
  id: string
  current: TaskStatus
}) {
  const [state, formAction, pending] = useActionState(changeTaskStatus, INITIAL)

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="id" value={id} />
      <label htmlFor="status_change" className="text-sm font-medium">
        Change Status
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <select
          id="status_change"
          name="status"
          defaultValue={current}
          className="min-h-[44px] flex-1 rounded-lg border px-3 py-2 text-base dark:border-zinc-700 dark:bg-zinc-800"
        >
          {TASK_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.replace('_', ' ')}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={pending}
          className="min-h-[44px] rounded-lg bg-black px-4 py-2 font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-black"
        >
          {pending ? 'Saving...' : 'Update'}
        </button>
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
    </form>
  )
}

export function DeleteTaskForm({ id }: { id: string }) {
  const [state, formAction, pending] = useActionState(deleteTask, INITIAL)

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (!window.confirm('Delete this task? It will be hidden from lists.')) {
          e.preventDefault()
        }
      }}
      className="flex flex-col gap-1"
    >
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        disabled={pending}
        className="min-h-[44px] rounded-lg border border-red-300 px-4 py-2 font-semibold text-red-600 disabled:opacity-50 dark:border-red-700 dark:text-red-300"
      >
        {pending ? 'Deleting...' : 'Delete Task'}
      </button>
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
    </form>
  )
}
