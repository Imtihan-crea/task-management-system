'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { UserRole } from '@/types/profile'
import { ROLE_LABELS } from '@/lib/auth/roles'
import { can } from '@/lib/auth/permissions'
import { KasuatLogo } from '@/components/brand/KasuatLogo'
import { LogoutButton } from '@/components/auth/LogoutButton'

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', permission: null },
  { href: '/projects', label: 'Projects', permission: 'projects.view' },
  { href: '/tasks', label: 'Tasks', permission: 'tasks.view' },
  { href: '/notifications', label: 'Notifications', permission: null },
  { href: '/activity', label: 'Activity', permission: null },
  { href: '/users', label: 'Users', permission: 'users.view' },
  { href: '/profile', label: 'Profile', permission: null },
] as const

export function Nav({
  role,
  email,
  bell,
}: {
  role: UserRole
  email: string
  bell?: ReactNode
}) {
  const pathname = usePathname()

  const visibleItems = NAV_ITEMS.filter((item) => {
    if (item.permission === null) return true
    return can(role, item.permission)
  })

  return (
    <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3 py-1">
          <KasuatLogo />
          <div className="min-w-0">
            <p className="truncate text-xs text-zinc-500">
              {email} &middot; {ROLE_LABELS[role]}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {bell}
          <nav className="flex flex-wrap gap-2" aria-label="Main navigation">
            {visibleItems.map((item) => {
              const active =
                pathname === item.href ||
                (item.href !== '/dashboard' && pathname.startsWith(item.href))

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={`inline-flex min-h-[44px] items-center rounded-lg border px-3 py-2 text-sm font-medium ${
                    active
                      ? 'border-kasuat-gold bg-kasuat-gold text-kasuat-black'
                      : 'border-zinc-300 hover:bg-kasuat-off-white dark:border-zinc-700 dark:hover:bg-zinc-800'
                  }`}
                >
                  {item.label}
                </Link>
              )
            })}
          </nav>
          <LogoutButton />
        </div>
      </div>
    </header>
  )
}
