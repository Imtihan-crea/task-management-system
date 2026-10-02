'use client'

import { useActionState } from 'react'
import {
  markAllNotificationsRead,
  markNotificationRead,
  saveNotificationPreferences,
  type PreferenceFormState,
} from '@/app/actions/notifications'
import Link from 'next/link'
import { notificationHref, type NotificationItem, type NotificationPreferences } from '@/types/notification'
import { formatDate } from '@/lib/utils/dates'

export function NotificationList({ items }: { items: NotificationItem[] }) {
  if (items.length === 0) {
    return (
      <p className="rounded-2xl bg-white p-8 text-center text-sm text-zinc-500 shadow dark:bg-zinc-900">
        No notifications yet.
      </p>
    )
  }

  return (
    <ul className="flex flex-col gap-3">
      {items.map((n) => (
        <li
          key={n.id}
          className={`rounded-2xl bg-white p-4 shadow dark:bg-zinc-900 ${n.is_read ? 'opacity-70' : ''}`}
        >
          <div className="flex items-start gap-3">
            <span aria-hidden="true" className="mt-0.5">
              {n.is_read ? '○' : '●'}
            </span>
            <div className="min-w-0 flex-1">
              <Link href={notificationHref(n.entity_type, n.entity_id)} className="font-semibold hover:underline">
                {n.title}
              </Link>
              {n.message && <p className="mt-0.5 text-sm text-zinc-500">{n.message}</p>}
              <p className="mt-1 text-xs text-zinc-400">{formatDate(n.created_at)}</p>
            </div>
            {!n.is_read && (
              <form action={markNotificationRead}>
                <input type="hidden" name="id" value={n.id} />
                <button
                  type="submit"
                  className="inline-flex min-h-[44px] items-center rounded-lg border px-3 py-1 text-sm font-medium"
                >
                  Mark read
                </button>
              </form>
            )}
          </div>
        </li>
      ))}
    </ul>
  )
}

export function MarkAllReadButton({ disabled }: { disabled: boolean }) {
  return (
    <form action={markAllNotificationsRead}>
      <button
        type="submit"
        disabled={disabled}
        className="inline-flex min-h-[44px] items-center rounded-lg border px-4 py-2 text-sm font-semibold disabled:opacity-50"
      >
        Mark all as read
      </button>
    </form>
  )
}

const PREF_FIELDS = [
  { name: 'email_enabled', label: 'Email Notifications (master switch)' },
  { name: 'email_task_updates', label: 'Task Assignment & Done' },
  { name: 'email_suggestion_updates', label: 'Suggestion Updates' },
  { name: 'email_deadline_alerts', label: 'Deadline Alerts' },
] as const

export function PreferencesForm({ initial }: { initial: NotificationPreferences }) {
  const [state, formAction, pending] = useActionState<PreferenceFormState, FormData>(
    saveNotificationPreferences,
    undefined
  )

  return (
    <form action={formAction} className="flex flex-col gap-3">
      {PREF_FIELDS.map((field) => (
        <label key={field.name} className="flex min-h-[44px] cursor-pointer items-center gap-3">
          <input
            type="checkbox"
            name={field.name}
            defaultChecked={initial[field.name]}
            className="h-5 w-5"
          />
          <span className="text-sm font-medium">{field.label}</span>
        </label>
      ))}

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
        {pending ? 'Saving...' : 'Save Preferences'}
      </button>
    </form>
  )
}
