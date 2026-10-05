'use client'

import { useActionState } from 'react'
import { createMeeting, type MeetingFormState } from '@/app/actions/meetings'
import { MEETING_TYPES } from '@/lib/db/schema'
import { MEETING_TYPE_LABELS } from '@/types/meeting'

const INITIAL: MeetingFormState = undefined

const inputCls =
  'w-full rounded-lg border px-3 py-2 text-base outline-none focus:border-black dark:border-zinc-700 dark:bg-zinc-800'

type Option = { id: string; code?: string; name?: string; full_name?: string | null; email?: string }

function labelOf(o: Option): string {
  if (o.code && o.name) return `${o.code} · ${o.name}`
  return o.full_name || o.email || o.id
}

/**
 * Form create meeting (§10, §11).
 *
 * Kalau `lockedProject` diisi (create dari Project), field Project
 * tampil read-only + hidden input — user tidak bisa mengganti (§3).
 */
export function MeetingForm({
  projects,
  users,
  selfId,
  canPickOrganizer,
  lockedProject,
}: {
  projects: Option[]
  users: Option[]
  selfId: string
  canPickOrganizer: boolean
  lockedProject?: { id: string; code: string; name: string } | null
}) {
  const [state, formAction, pending] = useActionState(createMeeting, INITIAL)

  return (
    <form action={formAction} className="mt-4 flex flex-col gap-4">
      {lockedProject ? (
        <div>
          <span className="mb-1 block text-sm font-medium">Project</span>
          <p className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-base dark:border-zinc-700 dark:bg-zinc-800">
            {lockedProject.code} · {lockedProject.name}
            <span className="ml-2 text-xs text-zinc-500">(locked)</span>
          </p>
          <input type="hidden" name="project_id" value={lockedProject.id} />
        </div>
      ) : (
        <div>
          <label htmlFor="mf-project" className="mb-1 block text-sm font-medium">
            Project <span className="font-normal text-zinc-500">(optional — kosongkan untuk global)</span>
          </label>
          <select id="mf-project" name="project_id" defaultValue="" className={inputCls}>
            <option value="">Global meeting (tanpa project)</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {labelOf(p)}
              </option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label htmlFor="mf-title" className="mb-1 block text-sm font-medium">
          Meeting Title <span aria-hidden="true">*</span>
        </label>
        <input
          id="mf-title"
          name="title"
          required
          maxLength={200}
          placeholder="Weekly Project Review"
          className={inputCls}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="mf-type" className="mb-1 block text-sm font-medium">
            Meeting Type
          </label>
          <select id="mf-type" name="meeting_type" defaultValue="INTERNAL_MEETING" className={inputCls}>
            {MEETING_TYPES.map((t) => (
              <option key={t} value={t}>
                {MEETING_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="mf-date" className="mb-1 block text-sm font-medium">
            Date <span aria-hidden="true">*</span>
          </label>
          <input id="mf-date" name="meeting_date" type="date" required className={inputCls} />
        </div>
        <div>
          <label htmlFor="mf-start" className="mb-1 block text-sm font-medium">
            Start Time <span aria-hidden="true">*</span>
          </label>
          <input id="mf-start" name="start_time" type="time" required className={inputCls} />
        </div>
        <div>
          <label htmlFor="mf-end" className="mb-1 block text-sm font-medium">
            End Time <span aria-hidden="true">*</span>
          </label>
          <input id="mf-end" name="end_time" type="time" required className={inputCls} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="mf-location" className="mb-1 block text-sm font-medium">
            Location
          </label>
          <input
            id="mf-location"
            name="location"
            maxLength={200}
            placeholder="Ruang rapat / WFO"
            className={inputCls}
          />
        </div>
        <div>
          <label htmlFor="mf-link" className="mb-1 block text-sm font-medium">
            Meeting Link
          </label>
          <input
            id="mf-link"
            name="meeting_link"
            type="url"
            maxLength={2000}
            placeholder="https://..."
            className={inputCls}
          />
        </div>
      </div>

      <div>
        <label htmlFor="mf-desc" className="mb-1 block text-sm font-medium">
          Description
        </label>
        <textarea
          id="mf-desc"
          name="description"
          rows={3}
          maxLength={5000}
          placeholder="Tujuan meeting..."
          className={inputCls}
        />
      </div>

      {canPickOrganizer ? (
        <div>
          <label htmlFor="mf-organizer" className="mb-1 block text-sm font-medium">
            Organizer
          </label>
          <select id="mf-organizer" name="organizer_id" defaultValue={selfId} className={inputCls}>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {labelOf(u)}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <input type="hidden" name="organizer_id" value={selfId} />
      )}

      <fieldset>
        <legend className="mb-1 block text-sm font-medium">Participants</legend>
        <div className="flex max-h-56 flex-col gap-1 overflow-y-auto rounded-lg border p-2 dark:border-zinc-700">
          {users.length === 0 && <p className="text-sm text-zinc-500">No active users.</p>}
          {users.map((u) => (
            <label
              key={u.id}
              className="flex min-h-[40px] cursor-pointer items-center gap-3 rounded-lg px-2 hover:bg-zinc-50 dark:hover:bg-zinc-800"
            >
              <input
                type="checkbox"
                name="participant_ids"
                value={u.id}
                defaultChecked={u.id === selfId}
                className="h-5 w-5"
              />
              <span className="text-sm">{labelOf(u)}</span>
            </label>
          ))}
        </div>
      </fieldset>

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
        {pending ? 'Saving...' : 'Create Meeting'}
      </button>
    </form>
  )
}