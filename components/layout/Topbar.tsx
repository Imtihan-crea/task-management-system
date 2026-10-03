'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Popover } from '@/components/ui/Popover'
import { notificationHref, type NotificationItem } from '@/types/notification'

type Summary = { unread: number; recent: NotificationItem[] }

function useSummary(active: boolean) {
  const [data, setData] = useState<Summary | null>(null)
  useEffect(() => {
    if (!active) return
    let cancelled = false
    fetch('/api/notifications/summary')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!cancelled && j) setData(j)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [active])
  return data
}

export function BellPopover() {
  const [open, setOpen] = useState(false)
  const summary = useSummary(open)
  const [marking, setMarking] = useState(false)
  const router = useRouter()

  async function markAll() {
    setMarking(true)
    try {
      await fetch('/api/notifications/read-all', { method: 'POST' })
      router.refresh()
      setOpen(false)
    } finally {
      setMarking(false)
    }
  }

  return (
    <Popover
      label="Notifications"
      button={
        <span className="relative inline-flex items-center">
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#BE9B5C"
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-5 w-5"
          >
            <path d="M18 8a6 6 0 00-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.7 21a2 2 0 01-3.4 0" />
          </svg>
          {(summary?.unread ?? 0) > 0 && (
            <span className="absolute -right-2 -top-2 inline-flex min-h-[20px] min-w-[20px] items-center justify-center rounded-full bg-red-600 px-1 text-[11px] font-bold text-white">
              {summary!.unread > 99 ? '99+' : summary!.unread}
            </span>
          )}
        </span>
      }
    >
      <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <p className="font-heading text-sm font-bold">Notifications</p>
        <Link href="/notifications" onClick={() => setOpen(false)} className="text-xs font-semibold text-kasuat-deep-gold hover:underline">
          View All
        </Link>
      </div>
      <ul className="max-h-80 overflow-y-auto">
        {!summary ? (
          <li className="px-4 py-6 text-center text-sm text-zinc-500">Loading...</li>
        ) : summary.recent.length === 0 ? (
          <li className="px-4 py-6 text-center text-sm text-zinc-500">No notifications yet.</li>
        ) : (
          summary.recent.map((n) => (
            <li key={n.id} className="border-b border-zinc-100 last:border-0 dark:border-zinc-800">
              <Link
                href={notificationHref(n.entity_type, n.entity_id)}
                onClick={() => setOpen(false)}
                className="block px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-800"
              >
                <p className="text-sm font-semibold">
                  {!n.is_read && <span aria-hidden="true" className="mr-1 text-red-600">●</span>}
                  {n.title}
                </p>
                {n.message && <p className="mt-0.5 truncate text-xs text-zinc-500">{n.message}</p>}
              </Link>
            </li>
          ))
        )}
      </ul>
      <div className="border-t border-zinc-200 px-4 py-2 dark:border-zinc-800">
        <button
          type="button"
          onClick={markAll}
          disabled={marking || !summary || summary.unread === 0}
          className="min-h-[44px] w-full rounded-lg text-sm font-semibold text-kasuat-deep-gold disabled:opacity-50"
        >
          {marking ? 'Saving...' : 'Mark all as read'}
        </button>
      </div>
    </Popover>
  )
}

export function ProfileMenu({
  name,
  email,
  role,
}: {
  name: string
  email: string
  role: string
}) {
  const router = useRouter()
  const [loggingOut, setLoggingOut] = useState(false)
  const initials = name
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  async function logout() {
    setLoggingOut(true)
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const items = [
    { href: '/profile', label: 'Lihat Profil' },
    { href: '/profile#edit-name', label: 'Ubah Profil' },
    { href: '/notifications#preferences', label: 'Preferensi Notifikasi' },
    { href: '/settings', label: 'Pengaturan Akun' },
  ]

  return (
    <Popover
      label="Profile menu"
      button={
        <span className="flex items-center gap-2">
          <span aria-hidden="true" className="flex h-8 w-8 items-center justify-center rounded-full bg-kasuat-gold text-xs font-bold text-kasuat-black">
            {initials || 'U'}
          </span>
          <span className="hidden text-left md:block">
            <span className="block max-w-28 truncate text-sm font-semibold text-zinc-100">{name}</span>
            <span className="block text-xs text-zinc-400">{role}</span>
          </span>
        </span>
      }
    >
      <div className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <p className="truncate text-sm font-bold">{name}</p>
        <p className="truncate text-xs text-zinc-500">{email}</p>
      </div>
      <ul className="py-1">
        {items.map((item) => (
          <li key={item.label}>
            <Link
              href={item.href}
              className="block px-4 py-2.5 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              {item.label}
            </Link>
          </li>
        ))}
        <li className="border-t border-zinc-200 dark:border-zinc-800">
          <button
            type="button"
            onClick={logout}
            disabled={loggingOut}
            className="block w-full px-4 py-2.5 text-left text-sm font-semibold text-red-600 disabled:opacity-50"
          >
            {loggingOut ? 'Loading...' : 'Logout'}
          </button>
        </li>
      </ul>
    </Popover>
  )
}

export function GlobalSearch() {
  const router = useRouter()
  const [value, setValue] = useState('')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  function onChange(v: string) {
    setValue(v)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      const q = v.trim()
      router.push(q ? `/tasks?q=${encodeURIComponent(q)}` : '/tasks')
    }, 400)
  }

  return (
    <form
      role="search"
      className="hidden min-w-0 flex-1 items-center md:flex"
      onSubmit={(e) => {
        e.preventDefault()
        if (timer.current) clearTimeout(timer.current)
        const q = value.trim()
        router.push(q ? `/tasks?q=${encodeURIComponent(q)}` : '/tasks')
      }}
    >
      <label htmlFor="global-search" className="sr-only">
        Cari project, task, atau apapun
      </label>
      <input
        id="global-search"
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Cari project, task, atau apapun...  (Ctrl+K)"
        className="h-10 w-full max-w-md rounded-lg border border-zinc-700 bg-zinc-800 px-3 text-sm text-zinc-100 placeholder:text-zinc-500"
      />
    </form>
  )
}
