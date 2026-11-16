'use client'

import { useFormAction } from '@/lib/forms/use-form-action'
import { importTracker } from '@/app/actions/tracker-import'
import type { TrackerImportState } from '@/lib/hr/import-tracker-run'

const INITIAL: TrackerImportState = undefined
const FIELD =
  'w-full rounded-lg border px-3 py-2 text-base outline-none focus:border-black dark:border-zinc-700 dark:bg-zinc-800'

export function ImportTrackerForm() {
  const [state, formAction, pending] = useFormAction(importTracker, INITIAL, () =>
    'Import histori Daily Tracker? Entri hasil import lama pada rentang tanggal yang sama akan diganti. Entri yang diisi lewat aplikasi tidak disentuh.'
  )

  return (
    <form {...formAction} className="flex flex-col gap-4">
      <div>
        <label htmlFor="imp_file" className="mb-1 block text-sm font-medium">
          File Excel (.xlsx) <span aria-hidden="true">*</span>
        </label>
        <input
          id="imp_file"
          name="file"
          type="file"
          required
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className={FIELD}
        />
      </div>

      {state?.error && (
        <div role="alert" className="text-sm font-medium text-red-600">
          <p>{state.error}</p>
          {state.errors && (
            <ul className="mt-1 list-disc pl-5">
              {state.errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
        </div>
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
        {pending ? 'Mengimport...' : 'Import'}
      </button>
    </form>
  )
}
