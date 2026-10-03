'use client'

import { useState } from 'react'
import type { UserRole } from '@/types/profile'
import { Sidebar, SidebarBrand } from '@/components/layout/Sidebar'
import { BellPopover, GlobalSearch, ProfileMenu } from '@/components/layout/Topbar'

const STORAGE_KEY = 'kasuat.sidebar.open'

/**
 * Persistent application shell (§5): sidebar + header tetap mounted
 * saat content berubah. Sidebar berperilaku sama di semua ukuran layar:
 * drawer overlay yang bisa dibuka/tutup, state dipersist.
 */
export function Shell({
  role,
  email,
  name,
  children,
}: {
  role: UserRole
  email: string
  name: string
  children: React.ReactNode
}) {
  // Default terbuka di desktop, tertutup di mobile. Lazy init tanpa effect.
  const [open, setOpen] = useState<boolean>(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY)
      if (saved !== null) return saved === '1'
      return window.innerWidth >= 1024
    } catch {
      return true
    }
  })

  function toggle() {
    setOpen((v) => {
      const next = !v
      try {
        window.localStorage.setItem(STORAGE_KEY, next ? '1' : '0')
      } catch {
        /* abaikan */
      }
      return next
    })
  }

  return (
    <div className="flex min-h-screen bg-kasuat-off-white dark:bg-black">
      {/* Sidebar desktop: drawer overlay yang sama seperti HP */}
      {open && (
        <div className="fixed inset-0 z-50" role="dialog" aria-label="Navigation">
          <button
            type="button"
            aria-label="Close navigation"
            onClick={toggle}
            className="absolute inset-0 bg-black/50"
          />
          <div className="absolute left-0 top-0 flex h-full w-72 flex-col bg-kasuat-black">
            <div className="flex items-center justify-between pr-2">
              <SidebarBrand />
              <button
                type="button"
                onClick={toggle}
                aria-label="Close navigation"
                className="inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded-lg text-zinc-200"
              >
                <span aria-hidden="true">✕</span>
              </button>
            </div>
            <div className="min-h-0 flex-1">
              <Sidebar role={role} onNavigate={toggle} />
            </div>
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topbar */}
        <header className="sticky top-0 z-40 border-b border-zinc-200 bg-white/95 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/95">
          <div className="mx-auto flex h-14 w-full max-w-5xl items-center gap-2 px-3">
            <button
              type="button"
              onClick={toggle}
              aria-label={open ? 'Close navigation' : 'Open navigation'}
              aria-expanded={open}
              className="inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded-lg border border-zinc-300 text-lg dark:border-zinc-700"
            >
              <span aria-hidden="true">☰</span>
            </button>
            <GlobalSearch />
            <div className="ml-auto flex items-center gap-2">
              <BellPopover />
              <ProfileMenu name={name} email={email} role={role} />
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-5xl flex-1 px-3 py-4">{children}</main>

        <footer className="mx-auto w-full max-w-5xl px-3 pb-4">
          <p className="text-center text-xs text-zinc-400">
            kasuat.co &middot; v1.10.0
          </p>
        </footer>
      </div>
    </div>
  )
}
