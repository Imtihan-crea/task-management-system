'use client'

import { useFormAction } from '@/lib/forms/use-form-action'
import { addWorkLogComment, type CommentFormState } from '@/app/actions/tracker-comments'

const INITIAL: CommentFormState = undefined

export function CommentForm({ logId }: { logId: string }) {
  const [state, formProps, pending] = useFormAction(addWorkLogComment, INITIAL)
  const id = `comment-${logId}`
  return (
    <form {...formProps} className="mt-1 flex flex-wrap items-end gap-2">
      <input type="hidden" name="work_log_id" value={logId} />
      <label htmlFor={id} className="sr-only">Komentar</label>
      <input
        id={id}
        name="comment"
        required
        maxLength={2000}
        placeholder="Tulis komentar…"
        className="min-w-0 flex-1 rounded-lg border px-3 py-2 text-sm outline-none focus:border-black dark:border-zinc-700 dark:bg-zinc-800"
      />
      <button type="submit" disabled={pending} className="min-h-[44px] rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-50 dark:border-zinc-700">
        {pending ? 'Mengirim...' : 'Kirim'}
      </button>
      {state?.error && <p role="alert" className="w-full text-sm text-red-600">{state.error}</p>}
      {state?.success && <p role="status" className="w-full text-sm text-green-600">{state.success}</p>}
    </form>
  )
}
