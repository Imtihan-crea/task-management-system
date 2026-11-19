'use client'

import { useFormAction } from '@/lib/forms/use-form-action'
import { sendBackupNow, type BackupNowState } from '@/app/actions/backup'

const INITIAL: BackupNowState = undefined

export function BackupNowButton() {
  const [state, formProps, pending] = useFormAction(sendBackupNow, INITIAL)
  return (
    <form {...formProps} className="flex flex-wrap items-center gap-3">
      <button type="submit" disabled={pending} className="min-h-[44px] rounded-lg bg-kasuat-gold px-4 py-2 font-semibold text-kasuat-black disabled:opacity-50">
        {pending ? 'Mengirim backup...' : 'Kirim backup sekarang'}
      </button>
      {state?.error && <p role="alert" className="text-sm font-medium text-red-600">{state.error}</p>}
      {state?.success && <p role="status" className="text-sm font-medium text-green-600">{state.success}</p>}
    </form>
  )
}
