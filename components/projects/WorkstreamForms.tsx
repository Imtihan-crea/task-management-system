'use client'

import { useActionState } from 'react'
import {
  createWorkstream,
  deleteWorkstream,
  updateWorkstream,
  type WorkstreamFormState,
} from '@/app/actions/workstreams'

const INITIAL: WorkstreamFormState = undefined

export function CreateWorkstreamForm({ projectId }: { projectId: string }) {
  const [state, formAction, pending] = useActionState(createWorkstream, INITIAL)

  return (
    <section className="rounded-2xl bg-white p-5 shadow dark:bg-zinc-900">
      <h2 className="text-lg font-bold">Create Workstream</h2>

      <form action={formAction} className="mt-4 flex flex-col gap-4">
        <input type="hidden" name="project_id" value={projectId} />

        <div>
          <label htmlFor="ws_name" className="mb-1 block text-sm font-medium">
            Name <span aria-hidden="true">*</span>
          </label>
          <input
            id="ws_name"
            name="name"
            required
            maxLength={150}
            placeholder="Nama workstream"
            className="w-full rounded-lg border px-3 py-2 text-base outline-none focus:border-black dark:border-zinc-700 dark:bg-zinc-800"
          />
        </div>

        <div>
          <label htmlFor="ws_desc" className="mb-1 block text-sm font-medium">
            Description
          </label>
          <textarea
            id="ws_desc"
            name="description"
            rows={2}
            placeholder="Deskripsi (opsional)"
            className="w-full rounded-lg border px-3 py-2 text-base outline-none focus:border-black dark:border-zinc-700 dark:bg-zinc-800"
          />
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
          {pending ? 'Saving...' : 'Create Workstream'}
        </button>
      </form>
    </section>
  )
}

export function EditWorkstreamForm({
  id,
  name,
  description,
}: {
  id: string
  name: string
  description: string | null
}) {
  const [state, formAction, pending] = useActionState(updateWorkstream, INITIAL)

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="id" value={id} />
      <input
        name="name"
        required
        maxLength={150}
        defaultValue={name}
        aria-label="Workstream name"
        className="min-h-[44px] w-full rounded-lg border px-3 py-2 text-base dark:border-zinc-700 dark:bg-zinc-800"
      />
      <input
        name="description"
        maxLength={500}
        defaultValue={description ?? ''}
        placeholder="Deskripsi"
        aria-label="Workstream description"
        className="min-h-[44px] w-full rounded-lg border px-3 py-2 text-base dark:border-zinc-700 dark:bg-zinc-800"
      />
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
        className="min-h-[44px] rounded-lg border px-4 py-2 text-sm font-semibold disabled:opacity-50"
      >
        {pending ? 'Saving...' : 'Save'}
      </button>
    </form>
  )
}

export function DeleteWorkstreamForm({ id }: { id: string }) {
  const [state, formAction, pending] = useActionState(deleteWorkstream, INITIAL)

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (!window.confirm('Delete this workstream? This cannot be undone.')) {
          e.preventDefault()
        }
      }}
      className="flex flex-col gap-1"
    >
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        disabled={pending}
        className="min-h-[44px] rounded-lg border border-red-300 px-3 py-2 text-sm font-semibold text-red-600 disabled:opacity-50 dark:border-red-700 dark:text-red-300"
      >
        {pending ? 'Deleting...' : 'Delete'}
      </button>
      {state?.error && (
        <p role="alert" className="text-xs font-medium text-red-600">
          {state.error}
        </p>
      )}
      {state?.success && (
        <p role="status" className="text-xs font-medium text-green-600">
          {state.success}
        </p>
      )}
    </form>
  )
}
