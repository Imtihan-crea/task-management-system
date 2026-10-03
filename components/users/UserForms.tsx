'use client'

import { useActionState } from 'react'
import { setUserStatus, updateUser, type UserFormState } from '@/app/actions/users'
import { ROLE_LABELS, STATUS_LABELS, USER_ROLES, USER_STATUSES } from '@/lib/auth/roles'
import type { UserRole, UserStatus } from '@/types/profile'

const INITIAL: UserFormState = undefined

type EditableUser = {
  id: string
  full_name: string | null
  email: string
  role: UserRole
  status: UserStatus
}

function SubmitButton({ pending, label }: { pending: boolean; label: string }) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="min-h-[44px] rounded-lg bg-kasuat-gold px-4 py-2 font-semibold text-kasuat-black disabled:opacity-50"
    >
      {pending ? 'Saving...' : label}
    </button>
  )
}

/** Tombol cepat aktif/nonaktif. Menutupi bagian "Activate / Deactivate". */
export function StatusToggleForm({ user }: { user: EditableUser }) {
  const [state, formAction, pending] = useActionState(setUserStatus, INITIAL)
  const nextStatus: UserStatus = user.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE'

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="id" value={user.id} />
      <input type="hidden" name="status" value={nextStatus} />
      <button
        type="submit"
        disabled={pending}
        className="min-h-[44px] rounded-lg border px-4 py-2 font-semibold disabled:opacity-50"
      >
        {pending ? 'Saving...' : nextStatus === 'ACTIVE' ? 'Activate' : 'Deactivate'}
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

/** Form edit: Full Name + Role + Status. Email read-only (PRD section 18). */
export function EditUserForm({ user }: { user: EditableUser }) {
  const [state, formAction, pending] = useActionState(updateUser, INITIAL)

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="id" value={user.id} />

      <div>
        <label htmlFor="edit_full_name" className="mb-1 block text-sm font-medium">
          Full Name
        </label>
        <input
          id="edit_full_name"
          name="full_name"
          required
          maxLength={120}
          defaultValue={user.full_name ?? ''}
          className="w-full rounded-lg border px-3 py-2 text-base outline-none focus:border-black dark:border-zinc-700 dark:bg-zinc-800"
        />
      </div>

      <div>
        <label htmlFor="edit_email" className="mb-1 block text-sm font-medium">
          Email
        </label>
        <input
          id="edit_email"
          value={user.email}
          readOnly
          disabled
          className="w-full cursor-not-allowed rounded-lg border px-3 py-2 text-base opacity-60 dark:border-zinc-700 dark:bg-zinc-800"
        />
        <p className="mt-1 text-xs text-zinc-500">
          Email tidak bisa diubah dari sini. Hubungi authentication provider.
        </p>
      </div>

      <div>
        <label htmlFor="edit_role" className="mb-1 block text-sm font-medium">
          Role
        </label>
        <select
          id="edit_role"
          name="role"
          defaultValue={user.role}
          className="min-h-[44px] w-full rounded-lg border px-3 py-2 text-base outline-none focus:border-black dark:border-zinc-700 dark:bg-zinc-800"
        >
          {USER_ROLES.map((role) => (
            <option key={role} value={role}>
              {ROLE_LABELS[role]}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="edit_status" className="mb-1 block text-sm font-medium">
          Status
        </label>
        <select
          id="edit_status"
          name="status"
          defaultValue={user.status}
          className="min-h-[44px] w-full rounded-lg border px-3 py-2 text-base outline-none focus:border-black dark:border-zinc-700 dark:bg-zinc-800"
        >
          {USER_STATUSES.map((status) => (
            <option key={status} value={status}>
              {STATUS_LABELS[status]}
            </option>
          ))}
        </select>
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

      <div>
        <SubmitButton pending={pending} label="Save Changes" />
      </div>
    </form>
  )
}
