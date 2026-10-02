'use client'

import { useActionState } from 'react'
import { submitEvidence, type TaskFormState } from '@/app/actions/tasks'

const INITIAL: TaskFormState = undefined

export function EvidenceForm({
  id,
  current,
  canSubmit,
}: {
  id: string
  current: string | null
  canSubmit: boolean
}) {
  const [state, formAction, pending] = useActionState(submitEvidence, INITIAL)

  return (
    <div className="flex flex-col gap-2">
      {current ? (
        <p className="text-sm">
          Current:{' '}
          <a
            href={current}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-blue-600 underline break-all dark:text-blue-300"
          >
            {current}
          </a>
        </p>
      ) : (
        <p className="text-sm text-zinc-500">No evidence yet.</p>
      )}

      {canSubmit && (
        <form action={formAction} className="flex flex-col gap-2">
          <input type="hidden" name="id" value={id} />
          <label htmlFor="evidence_url" className="text-sm font-medium">
            Submit Evidence (link)
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              id="evidence_url"
              name="evidence_url"
              type="url"
              inputMode="url"
              maxLength={2000}
              defaultValue={current ?? ''}
              placeholder="https://..."
              className="min-h-[44px] flex-1 rounded-lg border px-3 py-2 text-base dark:border-zinc-700 dark:bg-zinc-800"
            />
            <button
              type="submit"
              disabled={pending}
              className="min-h-[44px] rounded-lg bg-black px-4 py-2 font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-black"
            >
              {pending ? 'Saving...' : 'Save'}
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
      )}
    </div>
  )
}
