'use client'

import { useActionState } from 'react'
import { createProject, updateProject, type ProjectFormState } from '@/app/actions/projects'
import { PROJECT_STATUSES } from '@/lib/auth/roles'
import { displayName, type UserOption } from '@/lib/data/user-options'

const INITIAL: ProjectFormState = undefined

type ProjectFormValues = {
  id?: string
  name?: string
  client?: string | null
  description?: string | null
  project_manager_ids?: string[]
  start_date?: string | null
  end_date?: string | null
  status?: string
}

function FormFields({
  managers,
  initial,
  pending,
}: {
  managers: UserOption[]
  initial: ProjectFormValues
  pending: boolean
}) {
  return (
    <>
      <div>
        <label htmlFor="proj_name" className="mb-1 block text-sm font-medium">
          Project Name <span aria-hidden="true">*</span>
        </label>
        <input
          id="proj_name"
          name="name"
          required
          maxLength={150}
          defaultValue={initial.name ?? ''}
          placeholder="Nama project"
          className="w-full rounded-lg border px-3 py-2 text-base outline-none focus:border-black dark:border-zinc-700 dark:bg-zinc-800"
        />
      </div>

      <div>
        <label htmlFor="proj_client" className="mb-1 block text-sm font-medium">
          Client
        </label>
        <input
          id="proj_client"
          name="client"
          maxLength={150}
          defaultValue={initial.client ?? ''}
          placeholder="Nama client (opsional)"
          className="w-full rounded-lg border px-3 py-2 text-base outline-none focus:border-black dark:border-zinc-700 dark:bg-zinc-800"
        />
      </div>

      <div>
        <label htmlFor="proj_desc" className="mb-1 block text-sm font-medium">
          Description
        </label>
        <textarea
          id="proj_desc"
          name="description"
          rows={3}
          defaultValue={initial.description ?? ''}
          placeholder="Deskripsi singkat"
          className="w-full rounded-lg border px-3 py-2 text-base outline-none focus:border-black dark:border-zinc-700 dark:bg-zinc-800"
        />
      </div>

      <div>
        <label htmlFor="proj_pm" className="mb-1 block text-sm font-medium">
          Project Managers <span aria-hidden="true">*</span>
        </label>
        <p className="mb-1 text-xs text-zinc-500">
          Bisa pilih lebih dari satu (tahan Ctrl/Cmd saat klik).
        </p>
        <select
          id="proj_pm"
          name="project_manager_ids"
          required
          multiple
          size={Math.min(5, Math.max(managers.length, 3))}
          defaultValue={initial.project_manager_ids ?? []}
          className="min-h-[44px] w-full rounded-lg border px-3 py-2 text-base dark:border-zinc-700 dark:bg-zinc-800"
        >
          {managers.map((m) => (
            <option key={m.id} value={m.id}>
              {displayName(m)} ({m.email})
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="proj_start" className="mb-1 block text-sm font-medium">
            Start Date
          </label>
          <input
            id="proj_start"
            name="start_date"
            type="date"
            defaultValue={initial.start_date ?? ''}
            className="min-h-[44px] w-full rounded-lg border px-3 py-2 text-base dark:border-zinc-700 dark:bg-zinc-800"
          />
        </div>
        <div>
          <label htmlFor="proj_end" className="mb-1 block text-sm font-medium">
            Deadline
          </label>
          <input
            id="proj_end"
            name="end_date"
            type="date"
            defaultValue={initial.end_date ?? ''}
            className="min-h-[44px] w-full rounded-lg border px-3 py-2 text-base dark:border-zinc-700 dark:bg-zinc-800"
          />
        </div>
      </div>

      <div>
        <label htmlFor="proj_status" className="mb-1 block text-sm font-medium">
          Status
        </label>
        <select
          id="proj_status"
          name="status"
          defaultValue={initial.status ?? 'PLANNING'}
          className="min-h-[44px] w-full rounded-lg border px-3 py-2 text-base dark:border-zinc-700 dark:bg-zinc-800"
        >
          {PROJECT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.replace('_', ' ')}
            </option>
          ))}
        </select>
      </div>

      <button
        type="submit"
        disabled={pending}
        className="min-h-[44px] w-full rounded-lg bg-kasuat-gold px-4 py-2 font-semibold text-kasuat-black disabled:opacity-50 sm:w-auto"
      >
        {pending ? 'Saving...' : initial.id ? 'Save Changes' : 'Create Project'}
      </button>
    </>
  )
}

export function ProjectForm({
  mode,
  managers,
  initial,
}: {
  mode: 'create' | 'edit'
  managers: UserOption[]
  initial?: ProjectFormValues
}) {
  const action = mode === 'create' ? createProject : updateProject
  const [state, formAction, pending] = useActionState(action, INITIAL)
  const values = initial ?? {}

  return (
    <section className="rounded-2xl bg-white p-5 shadow dark:bg-zinc-900">
      <h2 className="text-lg font-bold">
        {mode === 'create' ? 'Create Project' : 'Edit Project'}
      </h2>

      <form action={formAction} className="mt-4 flex flex-col gap-4">
        {values.id && <input type="hidden" name="id" value={values.id} />}

        <FormFields managers={managers} initial={values} pending={pending} />

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
    </section>
  )
}
