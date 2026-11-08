'use client'

import { useState } from 'react'
import { useFormAction } from '@/lib/forms/use-form-action'
import { createUserWithPassword } from '@/app/actions/users'
import { ROLE_LABELS, USER_ROLES } from '@/lib/auth/roles'
import { MIN_ADMIN_PASSWORD_LENGTH } from '@/lib/auth/password'
import type { UserFormState } from '@/app/actions/users'

const INITIAL: UserFormState = undefined

/**
 * Opsi 1 (3 Nov 2026): admin membuat user langsung dengan email + password
 * yang diketik admin. Tidak ada email undangan — user langsung ACTIVE.
 *
 * Opsional: "Require password change on first login" -> user wajib
 * mengganti password sementara saat login pertama.
 */
export function CreateUserForm() {
  const [state, formAction, pending] = useFormAction(createUserWithPassword, INITIAL)
  const [show, setShow] = useState(false)

  return (
    <section className="rounded-2xl bg-white p-5 shadow dark:bg-zinc-900">
      <h2 className="text-lg font-bold">Create User with Password</h2>
      <p className="mt-1 text-sm text-zinc-500">
        User langsung aktif dan bisa login dengan password yang Anda ketik.
        Tidak ada email undangan yang dikirim — bagikan email &amp; password
        lewat kanal aman (WhatsApp/chat).
      </p>

      <form {...formAction} className="mt-4 flex flex-col gap-4">
        <div>
          <label htmlFor="create_full_name" className="mb-1 block text-sm font-medium">
            Full Name <span aria-hidden="true">*</span>
          </label>
          <input
            id="create_full_name"
            name="full_name"
            required
            maxLength={120}
            placeholder="Nama lengkap"
            className="w-full rounded-lg border px-3 py-2 text-base outline-none focus:border-black dark:border-zinc-700 dark:bg-zinc-800"
          />
        </div>

        <div>
          <label htmlFor="create_email" className="mb-1 block text-sm font-medium">
            Email <span aria-hidden="true">*</span>
          </label>
          <input
            id="create_email"
            name="email"
            type="email"
            required
            autoComplete="off"
            placeholder="nama@email.com"
            className="w-full rounded-lg border px-3 py-2 text-base outline-none focus:border-black dark:border-zinc-700 dark:bg-zinc-800"
          />
        </div>

        <div>
          <label htmlFor="create_password" className="mb-1 block text-sm font-medium">
            Password <span aria-hidden="true">*</span>
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              id="create_password"
              name="password"
              type={show ? 'text' : 'password'}
              required
              minLength={MIN_ADMIN_PASSWORD_LENGTH}
              autoComplete="new-password"
              className="min-h-[44px] w-full rounded-lg border px-3 py-2 text-base outline-none focus:border-black dark:border-zinc-700 dark:bg-zinc-800"
            />
            <label className="flex min-h-[44px] items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={show}
                onChange={(e) => setShow(e.target.checked)}
                className="h-4 w-4"
              />
              Show
            </label>
          </div>
          <p className="mt-1 text-xs text-zinc-500">
            Minimal {MIN_ADMIN_PASSWORD_LENGTH} karakter (mengikuti batas minimum
            Supabase Auth). Bagikan lewat kanal aman dan pertimbangkan opsi
            &quot;wajib ganti password saat login pertama&quot;.
          </p>
        </div>

        <div>
          <label htmlFor="create_role" className="mb-1 block text-sm font-medium">
            Role <span aria-hidden="true">*</span>
          </label>
          <select
            id="create_role"
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

        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            name="require_change"
            className="mt-1 h-4 w-4"
          />
          <span>
            <span className="font-medium">Require password change on first login</span>
            <span className="block text-xs text-zinc-500">
              Opsional. User harus mengganti password sementara sebelum bisa
              memakai aplikasi.
            </span>
          </span>
        </label>

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
          {pending ? 'Creating...' : 'Create User'}
        </button>
      </form>
    </section>
  )
}
