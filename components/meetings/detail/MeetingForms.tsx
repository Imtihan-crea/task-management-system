'use client'

import { useActionState } from 'react'
import {
  cancelMeeting,
  completeMeeting,
  scheduleMeeting,
  updateMeeting,
  updateMeetingNotes,
  type MeetingFormState,
} from '@/app/actions/meetings'
import { MEETING_TYPES } from '@/lib/db/schema'
import { MEETING_TYPE_LABELS } from '@/types/meeting'
import type { MeetingDetail } from '@/lib/data/meetings'

const INITIAL: MeetingFormState = undefined

const inputCls =
  'w-full rounded-lg border px-3 py-2 text-base outline-none focus:border-black dark:border-zinc-700 dark:bg-zinc-800'

function StateMessage({ state }: { state: MeetingFormState }) {
  return (
    <>
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
    </>
  )
}

type UserOption = { id: string; full_name: string | null; email: string }

/** Edit field inti (§15). Project tidak bisa diubah (konteks first-class). */
export function MeetingEditForm({
  meeting,
  users,
  canPickOrganizer,
}: {
  meeting: MeetingDetail
  users: UserOption[]
  canPickOrganizer: boolean
}) {
  const [state, formAction, pending] = useActionState(updateMeeting, INITIAL)

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="id" value={meeting.id} />

      <div>
        <label htmlFor="me-title" className="mb-1 block text-sm font-medium">
          Meeting Title <span aria-hidden="true">*</span>
        </label>
        <input
          id="me-title"
          name="title"
          required
          maxLength={200}
          defaultValue={meeting.title}
          className={inputCls}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="me-type" className="mb-1 block text-sm font-medium">
            Meeting Type
          </label>
          <select
            id="me-type"
            name="meeting_type"
            defaultValue={meeting.meeting_type}
            className={inputCls}
          >
            {MEETING_TYPES.map((t) => (
              <option key={t} value={t}>
                {MEETING_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="me-date" className="mb-1 block text-sm font-medium">
            Date <span aria-hidden="true">*</span>
          </label>
          <input
            id="me-date"
            name="meeting_date"
            type="date"
            required
            defaultValue={meeting.meeting_date}
            className={inputCls}
          />
        </div>
        <div>
          <label htmlFor="me-start" className="mb-1 block text-sm font-medium">
            Start Time <span aria-hidden="true">*</span>
          </label>
          <input
            id="me-start"
            name="start_time"
            type="time"
            required
            defaultValue={meeting.start_time.slice(0, 5)}
            className={inputCls}
          />
        </div>
        <div>
          <label htmlFor="me-end" className="mb-1 block text-sm font-medium">
            End Time <span aria-hidden="true">*</span>
          </label>
          <input
            id="me-end"
            name="end_time"
            type="time"
            required
            defaultValue={meeting.end_time.slice(0, 5)}
            className={inputCls}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="me-location" className="mb-1 block text-sm font-medium">
            Location
          </label>
          <input
            id="me-location"
            name="location"
            maxLength={200}
            defaultValue={meeting.location ?? ''}
            className={inputCls}
          />
        </div>
        <div>
          <label htmlFor="me-link" className="mb-1 block text-sm font-medium">
            Meeting Link
          </label>
          <input
            id="me-link"
            name="meeting_link"
            type="url"
            maxLength={2000}
            defaultValue={meeting.meeting_link ?? ''}
            className={inputCls}
          />
        </div>
      </div>

      <div>
        <label htmlFor="me-desc" className="mb-1 block text-sm font-medium">
          Description
        </label>
        <textarea
          id="me-desc"
          name="description"
          rows={3}
          maxLength={5000}
          defaultValue={meeting.description ?? ''}
          className={inputCls}
        />
      </div>

      {canPickOrganizer && (
        <div>
          <label htmlFor="me-organizer" className="mb-1 block text-sm font-medium">
            Organizer
          </label>
          <select
            id="me-organizer"
            name="organizer_id"
            defaultValue={meeting.organizer_id ?? ''}
            className={inputCls}
          >
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.full_name || u.email}
              </option>
            ))}
          </select>
        </div>
      )}

      <StateMessage state={state} />

      <button
        type="submit"
        disabled={pending}
        className="min-h-[44px] w-full rounded-lg bg-kasuat-gold px-4 py-2 font-semibold text-kasuat-black disabled:opacity-50 sm:w-auto"
      >
        {pending ? 'Saving...' : 'Save Changes'}
      </button>
    </form>
  )
}

/** Notes (§17): plain text, tetap bisa diisi setelah COMPLETED. */
export function NotesForm({ meetingId, initial }: { meetingId: string; initial: string }) {
  const [state, formAction, pending] = useActionState(updateMeetingNotes, INITIAL)

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="id" value={meetingId} />
      <label htmlFor="mn-notes" className="text-sm font-medium">
        Discussion Notes
      </label>
      <textarea
        id="mn-notes"
        name="notes"
        rows={10}
        maxLength={20000}
        defaultValue={initial}
        placeholder="Catatan diskusi meeting..."
        className={`${inputCls} whitespace-pre-wrap`}
      />
      <StateMessage state={state} />
      <button
        type="submit"
        disabled={pending}
        className="min-h-[44px] w-full rounded-lg bg-kasuat-gold px-4 py-2 font-semibold text-kasuat-black disabled:opacity-50 sm:w-auto"
      >
        {pending ? 'Saving...' : 'Save Notes'}
      </button>
    </form>
  )
}

/**
 * Tombol lifecycle (§13, §41).
 * Complete menampilkan ringkasan post-meeting (server-rendered) sebelum tombol.
 */
export function LifecycleButtons({
  meetingId,
  status,
  summary,
}: {
  meetingId: string
  status: string
  summary?: { actionItems: number; tasksCreated: number; tasksReady: number }
}) {
  const [schedState, schedAction, schedPending] = useActionState(scheduleMeeting, INITIAL)
  const [compState, compAction, compPending] = useActionState(completeMeeting, INITIAL)
  const [cancelState, cancelAction, cancelPending] = useActionState(cancelMeeting, INITIAL)

  return (
    <div className="flex flex-col gap-3">
      {status === 'DRAFT' && (
        <form action={schedAction}>
          <input type="hidden" name="id" value={meetingId} />
          {schedState?.error && (
            <p role="alert" className="mb-2 text-sm font-medium text-red-600">
              {schedState.error}
            </p>
          )}
          {schedState?.success && (
            <p role="status" className="mb-2 text-sm font-medium text-green-600">
              {schedState.success}
            </p>
          )}
          <button
            type="submit"
            disabled={schedPending}
            className="inline-flex min-h-[44px] items-center rounded-lg bg-kasuat-gold px-4 py-2 text-sm font-semibold text-kasuat-black disabled:opacity-50"
          >
            {schedPending ? 'Scheduling...' : 'Schedule Meeting'}
          </button>
        </form>
      )}

      {status === 'SCHEDULED' && (
        <>
          {summary && (
            <div className="rounded-xl border border-zinc-200 p-3 text-sm dark:border-zinc-700">
              <p className="font-semibold">Sebelum menyelesaikan meeting:</p>
              <ul className="mt-1 list-disc pl-5 text-zinc-600 dark:text-zinc-300">
                <li>Action Items: {summary.actionItems}</li>
                <li>Tasks already created: {summary.tasksCreated}</li>
                <li>Tasks ready to create: {summary.tasksReady}</li>
              </ul>
            </div>
          )}
          <form action={compAction}>
            <input type="hidden" name="id" value={meetingId} />
            {compState?.error && (
              <p role="alert" className="mb-2 text-sm font-medium text-red-600">
                {compState.error}
              </p>
            )}
            {compState?.success && (
              <p role="status" className="mb-2 text-sm font-medium text-green-600">
                {compState.success}
              </p>
            )}
            <button
              type="submit"
              disabled={compPending}
              className="inline-flex min-h-[44px] items-center rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {compPending ? 'Completing...' : 'Complete Meeting'}
            </button>
          </form>
        </>
      )}

      {(status === 'DRAFT' || status === 'SCHEDULED') && (
        <form action={cancelAction}>
          <input type="hidden" name="id" value={meetingId} />
          {cancelState?.error && (
            <p role="alert" className="mb-2 text-sm font-medium text-red-600">
              {cancelState.error}
            </p>
          )}
          {cancelState?.success && (
            <p role="status" className="mb-2 text-sm font-medium text-green-600">
              {cancelState.success}
            </p>
          )}
          <button
            type="submit"
            disabled={cancelPending}
            className="inline-flex min-h-[44px] items-center rounded-lg border border-red-300 px-4 py-2 text-sm font-semibold text-red-600 disabled:opacity-50 dark:border-red-700 dark:text-red-300"
          >
            {cancelPending ? 'Cancelling...' : 'Cancel Meeting'}
          </button>
        </form>
      )}
    </div>
  )
}