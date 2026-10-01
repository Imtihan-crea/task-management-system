'use client'

import { useActionState } from 'react'
import { inviteUser } from '@/app/actions/users'
import { ROLE_LABELS, USER_ROLES } from '@/lib/auth/roles'
import type { UserFormState } from '@/app/actions/users'

const INITIAL: UserFormState = undefined

export function InviteUserForm() {
  const [state, formAction, pending] = useActionState(inviteUser, INITIAL)

  return (
    <section className="rounded-2xl bg-white p-5 shadow dark:bg-zinc-900">
      <h2 className="text-lg font-bold">Invite User</h2>
      <p className="mt-1 text-sm text-zinc-500">
        User menerima email untuk mengatur password sendiri. Admin tidak
        pernah melihat password.
      </p>

      <form action={formAction} className="mt-4 flex flex-col gap-4">
        <div>
          <label htmlFor="full_name" className="mb-1 block text-sm font-medium">
            Full Name <span aria-hidden="true">*</span>
          </label>
          <input
            id="full_name"
            name="full_name"
            required
            maxLength={120}
            placeholder="Nama lengkap"
            className="w-full rounded-lg border px-3 py-2 text-base outline-none focus:border-black dark:border-zinc-700 dark:bg-zinc-800"
          />
        </div>

        <div>
          <label htmlFor="email" className="mb-1 block text-sm font-medium">
            Email <span aria-hidden="true">*</span>
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="off"
            placeholder="nama@email.com"
            className="w-full rounded-lg border px-3 py-2 text-base outline-none focus:border-black dark:border-zinc-700 dark:bg-zinc-800"
          />
        </div>

        <div>
          <label htmlFor="role" className="mb-1 block text-sm font-medium">
            Role <span aria-hidden="true">*</span>
          </label>
          <select
            id="role"
            name="role"
            defaultValue="TEAM_MEMBER"
            className="min-h-[44px] w-full rounded-lg border px-3 py-2 text-base outline-none focus:border-black dark:border-zinc-700 dark:bg-zinc-800"
          >
            {USER_ROLES.map((role) => (
              <option key={role} value={role}>
                {ROLE_LABELS[role]}
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

        <button
          type="submit"
          disabled={pending}
          className="min-h-[44px] w-full rounded-lg bg-black px-4 py-2 font-semibold text-white disabled:opacity-50 sm:w-auto dark:bg-white dark:text-black"
        >
          {pending ? 'Sending...' : 'Send Invitation'}
        </button>
      </form>
    </section>
  )
}
