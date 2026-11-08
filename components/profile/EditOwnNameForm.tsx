'use client'

import { useFormAction } from '@/lib/forms/use-form-action'
import { updateOwnName, type ProfileFormState } from '@/app/actions/profile'

const INITIAL: ProfileFormState = undefined

export function EditOwnNameForm({ fullName }: { fullName: string }) {
  const [state, formAction, pending] = useFormAction(updateOwnName, INITIAL)

  return (
    <form {...formAction} className="flex flex-col gap-4">
      <div>
        <label htmlFor="full_name" className="mb-1 block text-sm font-medium">
          Full Name
        </label>
        <input
          id="full_name"
          name="full_name"
          required
          maxLength={120}
          defaultValue={fullName}
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
        className="min-h-[44px] w-full rounded-lg bg-kasuat-gold px-4 py-2 font-semibold text-kasuat-black disabled:opacity-50 sm:w-auto"
      >
        {pending ? 'Saving...' : 'Save'}
      </button>
    </form>
  )
}
