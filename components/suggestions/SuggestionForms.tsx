'use client'

import { useActionState, useState } from 'react'
import {
  createSuggestion,
  resubmitSuggestion,
  reviewSuggestion,
  type SuggestionFormState,
} from '@/app/actions/suggestions'
import { TASK_PRIORITIES } from '@/lib/auth/roles'

const INITIAL: SuggestionFormState = undefined

export type ProjectOption = { id: string; code: string; name: string }
export type WorkstreamOption = { id: string; project_id: string; code: string; name: string }
export type AssigneeOption = { id: string; full_name: string | null; email: string }

export function SuggestionForm({
  projects,
  workstreams,
  users,
  initialProjectId,
}: {
  projects: ProjectOption[]
  workstreams: WorkstreamOption[]
  users: AssigneeOption[]
  initialProjectId?: string
}) {
  const [state, formAction, pending] = useActionState(createSuggestion, INITIAL)
  // Preset dari ?project=, tapi hanya dipakai kalau project itu ada di list.
  const validPreset =
    initialProjectId && projects.some((p) => p.id === initialProjectId)
      ? initialProjectId
      : ''
  const [projectId, setProjectId] = useState(validPreset)
  const filteredWorkstreams = workstreams.filter((w) => w.project_id === projectId)

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div>
        <label htmlFor="sug_title" className="mb-1 block text-sm font-medium">
          Task Title <span aria-hidden="true">*</span>
        </label>
        <input
          id="sug_title"
          name="title"
          required
          maxLength={200}
          placeholder="Judul pekerjaan yang diusulkan"
          className="w-full rounded-lg border px-3 py-2 text-base outline-none focus:border-black dark:border-zinc-700 dark:bg-zinc-800"
        />
      </div>

      <div>
        <label htmlFor="sug_desc" className="mb-1 block text-sm font-medium">
          Description <span aria-hidden="true">*</span>
        </label>
        <textarea
          id="sug_desc"
          name="description"
          required
          rows={4}
          placeholder="Jelaskan pekerjaan yang diusulkan"
          className="w-full rounded-lg border px-3 py-2 text-base outline-none focus:border-black dark:border-zinc-700 dark:bg-zinc-800"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="sug_project" className="mb-1 block text-sm font-medium">
            Project <span aria-hidden="true">*</span>
          </label>
          <select
            id="sug_project"
            name="project_id"
            required
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="min-h-[44px] w-full rounded-lg border px-3 py-2 text-base dark:border-zinc-700 dark:bg-zinc-800"
          >
            <option value="">— Pilih —</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code} · {p.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="sug_ws" className="mb-1 block text-sm font-medium">
            Workstream
          </label>
          <select
            id="sug_ws"
            name="workstream_id"
            className="min-h-[44px] w-full rounded-lg border px-3 py-2 text-base dark:border-zinc-700 dark:bg-zinc-800"
          >
            <option value="">— None —</option>
            {filteredWorkstreams.map((w) => (
              <option key={w.id} value={w.id}>
                {w.code} · {w.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label htmlFor="sug_assignee" className="mb-1 block text-sm font-medium">
          Suggested Assignee
        </label>
        <select
          id="sug_assignee"
          name="suggested_assignee_id"
          className="min-h-[44px] w-full rounded-lg border px-3 py-2 text-base dark:border-zinc-700 dark:bg-zinc-800"
        >
          <option value="">— None —</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.full_name || u.email} ({u.email})
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="sug_priority" className="mb-1 block text-sm font-medium">
            Suggested Priority
          </label>
          <select
            id="sug_priority"
            name="suggested_priority"
            defaultValue=""
            className="min-h-[44px] w-full rounded-lg border px-3 py-2 text-base dark:border-zinc-700 dark:bg-zinc-800"
          >
            <option value="">— None —</option>
            {TASK_PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="sug_deadline" className="mb-1 block text-sm font-medium">
            Suggested Deadline
          </label>
          <input
            id="sug_deadline"
            name="suggested_deadline"
            type="date"
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
        {pending ? 'Submitting...' : 'Submit Suggestion'}
      </button>
    </form>
  )
}

export function ResubmitForm({
  id,
  title,
  description,
  workstreamId,
  assigneeId,
  priority,
  deadline,
  workstreams,
  users,
  projectId,
}: {
  id: string
  title: string
  description: string
  workstreamId: string | null
  assigneeId: string | null
  priority: string | null
  deadline: string | null
  workstreams: WorkstreamOption[]
  users: AssigneeOption[]
  projectId: string
}) {
  const [state, formAction, pending] = useActionState(resubmitSuggestion, INITIAL)
  const scopedWorkstreams = workstreams.filter((w) => w.project_id === projectId)

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="id" value={id} />

      <div>
        <label htmlFor="re_title" className="mb-1 block text-sm font-medium">
          Task Title <span aria-hidden="true">*</span>
        </label>
        <input
          id="re_title"
          name="title"
          required
          maxLength={200}
          defaultValue={title}
          className="w-full rounded-lg border px-3 py-2 text-base dark:border-zinc-700 dark:bg-zinc-800"
        />
      </div>

      <div>
        <label htmlFor="re_desc" className="mb-1 block text-sm font-medium">
          Description <span aria-hidden="true">*</span>
        </label>
        <textarea
          id="re_desc"
          name="description"
          required
          rows={4}
          defaultValue={description}
          className="w-full rounded-lg border px-3 py-2 text-base dark:border-zinc-700 dark:bg-zinc-800"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="re_ws" className="mb-1 block text-sm font-medium">
            Workstream
          </label>
          <select
            id="re_ws"
            name="workstream_id"
            defaultValue={workstreamId ?? ''}
            className="min-h-[44px] w-full rounded-lg border px-3 py-2 text-base dark:border-zinc-700 dark:bg-zinc-800"
          >
            <option value="">— None —</option>
            {scopedWorkstreams.map((w) => (
              <option key={w.id} value={w.id}>
                {w.code} · {w.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="re_assignee" className="mb-1 block text-sm font-medium">
            Suggested Assignee
          </label>
          <select
            id="re_assignee"
            name="suggested_assignee_id"
            defaultValue={assigneeId ?? ''}
            className="min-h-[44px] w-full rounded-lg border px-3 py-2 text-base dark:border-zinc-700 dark:bg-zinc-800"
          >
            <option value="">— None —</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.full_name || u.email} ({u.email})
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="re_priority" className="mb-1 block text-sm font-medium">
            Suggested Priority
          </label>
          <select
            id="re_priority"
            name="suggested_priority"
            defaultValue={priority ?? ''}
            className="min-h-[44px] w-full rounded-lg border px-3 py-2 text-base dark:border-zinc-700 dark:bg-zinc-800"
          >
            <option value="">— None —</option>
            {TASK_PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="re_deadline" className="mb-1 block text-sm font-medium">
            Suggested Deadline
          </label>
          <input
            id="re_deadline"
            name="suggested_deadline"
            type="date"
            defaultValue={deadline ?? ''}
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
        {pending ? 'Resubmitting...' : 'Fix & Resubmit'}
      </button>
    </form>
  )
}

export function ReviewForm({
  id,
  users,
  suggestedAssigneeId,
}: {
  id: string
  users: { id: string; full_name: string | null; email: string }[]
  suggestedAssigneeId: string | null
}) {
  const [state, formAction, pending] = useActionState(reviewSuggestion, INITIAL)

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="id" value={id} />

      <div>
        <label htmlFor="review_assignee" className="mb-1 block text-sm font-medium">
          Assignee (dipakai saat approve)
        </label>
        <select
          id="review_assignee"
          name="assignee_id"
          defaultValue={suggestedAssigneeId ?? ''}
          className="min-h-[44px] w-full rounded-lg border px-3 py-2 text-base dark:border-zinc-700 dark:bg-zinc-800"
        >
          <option value="">— Pilih —</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.full_name || u.email} ({u.email})
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="review_note" className="mb-1 block text-sm font-medium">
          Review Note (wajib untuk revise/reject)
        </label>
        <textarea
          id="review_note"
          name="review_note"
          rows={3}
          maxLength={2000}
          placeholder="Alasan atau masukan untuk creator"
          className="w-full rounded-lg border px-3 py-2 text-base dark:border-zinc-700 dark:bg-zinc-800"
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

      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          type="submit"
          name="decision"
          value="approve"
          disabled={pending}
          className="min-h-[44px] flex-1 rounded-lg bg-black px-4 py-2 font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-black"
        >
          {pending ? 'Saving...' : 'Approve'}
        </button>
        <button
          type="submit"
          name="decision"
          value="revise"
          disabled={pending}
          className="min-h-[44px] flex-1 rounded-lg border px-4 py-2 font-semibold disabled:opacity-50"
        >
          {pending ? 'Saving...' : 'Request Revision'}
        </button>
        <button
          type="submit"
          name="decision"
          value="reject"
          disabled={pending}
          className="min-h-[44px] flex-1 rounded-lg border border-red-300 px-4 py-2 font-semibold text-red-600 disabled:opacity-50 dark:border-red-700 dark:text-red-300"
        >
          {pending ? 'Saving...' : 'Reject'}
        </button>
      </div>
    </form>
  )
}
