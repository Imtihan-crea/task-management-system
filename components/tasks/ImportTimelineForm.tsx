'use client'

import { useFormAction } from '@/lib/forms/use-form-action'
import { importTimeline } from '@/app/actions/task-import'
import type { ImportState } from '@/lib/import/run'

const INITIAL: ImportState = undefined
const FIELD =
  'w-full rounded-lg border px-3 py-2 text-base outline-none focus:border-black dark:border-zinc-700 dark:bg-zinc-800'

export function ImportTimelineForm({
  projects,
  users,
  presetProject,
}: {
  projects: { id: string; code: string; name: string }[]
  users: { id: string; full_name: string | null }[]
  presetProject: string
}) {
  const [state, formAction, pending] = useFormAction(importTimeline, INITIAL)

  return (
    <form {...formAction} className="flex flex-col gap-4">
      <div>
        <label htmlFor="imp_project" className="mb-1 block text-sm font-medium">
          Project tujuan <span aria-hidden="true">*</span>
        </label>
        <select id="imp_project" name="project_id" required defaultValue={presetProject} className={FIELD}>
          <option value="">Pilih project</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.code} · {p.name}
            </option>
          ))}
        </select>
      </div>

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

      <div>
        <label htmlFor="imp_fallback" className="mb-1 block text-sm font-medium">
          PIC cadangan
        </label>
        <select id="imp_fallback" name="fallback_assignee_id" defaultValue="" className={FIELD}>
          <option value="">Tidak ada (tolak bila PIC belum punya akun)</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.full_name ?? '(tanpa nama)'}
            </option>
          ))}
        </select>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Dipakai untuk baris yang Nama PIC-nya belum punya akun. Nama PIC asli tetap tertulis di deskripsi task.
        </p>
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
