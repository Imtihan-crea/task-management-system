'use client'

import { useFormAction } from '@/lib/forms/use-form-action'
import {
  cancelTask,
  changeTaskStatus,
  decideReview,
  deleteTask,
  submitTask,
  type TaskFormState,
} from '@/app/actions/tasks'
import { OPEN_TASK_STATUSES, taskStatusLabel } from '@/lib/auth/roles'
import type { TaskStatus } from '@/types/task'

const INITIAL: TaskFormState = undefined

export function ChangeStatusForm({
  id,
  current,
}: {
  id: string
  current: TaskStatus
}) {
  const [state, formAction, pending] = useFormAction(changeTaskStatus, INITIAL)

  return (
    <form {...formAction} className="flex flex-col gap-2">
      <input type="hidden" name="id" value={id} />
      <label htmlFor="status_change" className="text-sm font-medium">
        Ubah Status
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <select
          id="status_change"
          name="status"
          defaultValue={current}
          className="min-h-[44px] flex-1 rounded-lg border px-3 py-2 text-base dark:border-zinc-700 dark:bg-zinc-800"
        >
          {/* DONE/CANCELLED/REVIEW hanya lewat tombol submit di bawah. */}
          {(current === 'REVIEW' ? ['REVIEW' as const, ...OPEN_TASK_STATUSES] : OPEN_TASK_STATUSES).map((s) => (
            <option key={s} value={s}>
              {taskStatusLabel(s)}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={pending}
          className="min-h-[44px] rounded-lg bg-kasuat-gold px-4 py-2 font-semibold text-kasuat-black disabled:opacity-50"
        >
          {pending ? 'Menyimpan...' : 'Perbarui'}
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

/**
 * Tombol submit Done / Cancel (7 Okt 2026): sifatnya submit, bukan pilihan
 * dropdown — supaya completed_at/cancelled_at selalu tercatat.
 */
function SubmitStateMessage({ state }: { state: TaskFormState }) {
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

/** `toReview`: consultant (bukan pengelola project) -> task masuk Menunggu Review PM. */
export function SubmitTaskForm({ id, toReview = false }: { id: string; toReview?: boolean }) {
  const [state, formAction, pending] = useFormAction(submitTask, INITIAL)

  return (
    <form {...formAction} className="flex flex-col gap-2">
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        disabled={pending}
        className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-green-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        {pending ? 'Mengirim...' : toReview ? 'Submit untuk Review PM' : 'Submit sebagai Done'}
      </button>
      <SubmitStateMessage state={state} />
    </form>
  )
}

/** PM/Admin memutuskan task yang menunggu review (20 Nov 2026). */
export function ReviewDecisionForm({ id }: { id: string }) {
  const [state, formAction, pending] = useFormAction(decideReview, INITIAL, (fd) =>
    fd.get('decision') === 'return' ? 'Kembalikan task ini ke consultant? Status kembali IN PROGRESS.' : null
  )

  return (
    <form {...formAction} className="flex flex-col gap-2">
      <input type="hidden" name="id" value={id} />
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Task ini sudah diserahkan consultant dan menunggu keputusan Anda.
      </p>
      <label htmlFor={`review_note_${id}`} className="text-sm font-medium">
        Catatan untuk consultant (opsional)
      </label>
      <textarea
        id={`review_note_${id}`}
        name="note"
        rows={2}
        maxLength={1000}
        className="rounded-lg border px-3 py-2 text-base dark:border-zinc-700 dark:bg-zinc-800"
      />
      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          type="submit"
          name="decision"
          value="approve"
          disabled={pending}
          className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-lg bg-green-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          Setujui (Done)
        </button>
        <button
          type="submit"
          name="decision"
          value="return"
          disabled={pending}
          className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-lg border border-amber-500 px-4 py-2 text-sm font-semibold text-amber-700 disabled:opacity-50 dark:text-amber-300"
        >
          Kembalikan ke Consultant
        </button>
      </div>
      <SubmitStateMessage state={state} />
    </form>
  )
}

export function CancelTaskForm({ id }: { id: string }) {
  const [state, formAction, pending] = useFormAction(cancelTask, INITIAL, () => 'Batalkan task ini? Task akan terkunci seperti task yang sudah Done.')

  return (
    <form
      {...formAction}
      className="flex flex-col gap-2"
    >
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        disabled={pending}
        className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-zinc-400 px-4 py-2 text-sm font-semibold text-zinc-600 disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-300"
      >
        {pending ? 'Membatalkan...' : 'Batalkan Task'}
      </button>
      <SubmitStateMessage state={state} />
    </form>
  )
}

export function DeleteTaskForm({ id }: { id: string }) {
  const [state, formAction, pending] = useFormAction(deleteTask, INITIAL, () => 'Hapus task ini? Task akan disembunyikan dari daftar.')

  return (
    <form
      {...formAction}
      className="flex flex-col gap-1"
    >
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        disabled={pending}
        className="min-h-[44px] rounded-lg border border-red-300 px-4 py-2 font-semibold text-red-600 disabled:opacity-50 dark:border-red-700 dark:text-red-300"
      >
        {pending ? 'Menghapus...' : 'Hapus Task'}
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
