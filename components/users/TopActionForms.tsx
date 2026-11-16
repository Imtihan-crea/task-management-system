'use client'

import { useFormAction } from '@/lib/forms/use-form-action'
import { changeUserEmail, deleteUserAccount, setUserPassword } from '@/app/actions/users'
import { MIN_ADMIN_PASSWORD_LENGTH } from '@/lib/auth/password'

type State = { error?: string; success?: string } | undefined
const INITIAL: State = undefined
const FIELD =
  'w-full rounded-lg border px-3 py-2 text-base outline-none focus:border-black dark:border-zinc-700 dark:bg-zinc-800'
const BTN = 'min-h-[44px] rounded-lg border px-4 py-2 font-semibold disabled:opacity-50'

function Status({ state }: { state: State }) {
  if (state?.error) return <p role="alert" className="text-sm font-medium text-red-600">{state.error}</p>
  if (state?.success) return <p role="status" className="text-sm font-medium text-green-600">{state.success}</p>
  return null
}

/** Tindakan khusus Super Admin / Developer di detail user. */
export function TopActionForms({
  user,
  canDelete,
}: {
  user: { id: string; email: string; full_name: string | null }
  canDelete: boolean
}) {
  const [pwState, pwAction, pwPending] = useFormAction(setUserPassword, INITIAL)
  const [emailState, emailAction, emailPending] = useFormAction(changeUserEmail, INITIAL)
  const [delState, delAction, delPending] = useFormAction(
    deleteUserAccount,
    INITIAL,
    () => `Hapus akun ${user.full_name || user.email}? Akun tidak bisa login lagi dan tidak bisa diaktifkan dari aplikasi. Riwayatnya tetap ada.`
  )

  return (
    <div className="flex flex-col gap-6">
      <form {...pwAction} className="flex flex-col gap-2">
        <input type="hidden" name="id" value={user.id} />
        <label htmlFor="top_password" className="text-sm font-medium">Set password baru</label>
        <input
          id="top_password"
          name="password"
          type="password"
          required
          minLength={MIN_ADMIN_PASSWORD_LENGTH}
          autoComplete="new-password"
          className={FIELD}
        />
        <p className="text-xs text-zinc-600 dark:text-zinc-400">Password sementara: user wajib menggantinya saat login berikutnya.</p>
        <button type="submit" disabled={pwPending} className={BTN}>
          {pwPending ? 'Menyimpan...' : 'Set password'}
        </button>
        <Status state={pwState} />
      </form>

      <form {...emailAction} className="flex flex-col gap-2">
        <input type="hidden" name="id" value={user.id} />
        <label htmlFor="top_email" className="text-sm font-medium">Ganti email / ID login</label>
        <input id="top_email" name="email" type="email" required defaultValue={user.email} maxLength={254} className={FIELD} />
        <button type="submit" disabled={emailPending} className={BTN}>
          {emailPending ? 'Menyimpan...' : 'Ganti email'}
        </button>
        <Status state={emailState} />
      </form>

      {canDelete && (
        <form {...delAction} className="flex flex-col gap-2">
          <input type="hidden" name="id" value={user.id} />
          <p className="text-sm font-medium">Hapus akun</p>
          <p className="text-xs text-zinc-600 dark:text-zinc-400">
            Akun tidak bisa login lagi. Nama tetap tampil di riwayat task, meeting, dan activity.
          </p>
          <button
            type="submit"
            disabled={delPending}
            className="min-h-[44px] rounded-lg border border-red-300 px-4 py-2 font-semibold text-red-600 disabled:opacity-50 dark:border-red-700 dark:text-red-300"
          >
            {delPending ? 'Menghapus...' : 'Hapus akun'}
          </button>
          <Status state={delState} />
        </form>
      )}
    </div>
  )
}
