'use client'

import { useState } from 'react'
import type { UserRole } from '@/types/profile'
import { Sidebar, SidebarBrand } from '@/components/layout/Sidebar'
import { BellPopover, GlobalSearch, ProfileMenu } from '@/components/layout/Topbar'

const STORAGE_KEY = 'kasuat.sidebar.collapsed'

/**
 * Persistent application shell (§5): sidebar + header tetap mounted
 * saat content berubah. Desktop: sidebar persisten (expanded/collapsed
 * icon). Mobile: drawer overlay. Toggle selalu garis tiga (§4).
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
  // Collapsed = mode icon. Lazy init tanpa effect.
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem(STORAGE_KEY) === '1'
    } catch {
      return false
    }
  })
  const [drawer, setDrawer] = useState(false)

  function toggleDesktop() {
    setCollapsed((v) => {
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
      {/* Sidebar desktop persisten */}
      <aside
        className={`sticky top-0 hidden h-screen shrink-0 flex-col bg-kasuat-black transition-[width] duration-200 lg:flex ${
          collapsed ? 'w-[76px]' : 'w-60'
        }`}
      >
        <SidebarBrand collapsed={collapsed} />
        <div className="min-h-0 flex-1">
          <Sidebar role={role} collapsed={collapsed} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topbar */}
        <header className="sticky top-0 z-40 border-b border-zinc-200 bg-white/95 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/95">
          <div className="mx-auto flex h-14 w-full max-w-5xl items-center gap-2 px-3">
            <button
              type="button"
              onClick={toggleDesktop}
              aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
              aria-expanded={!collapsed}
              title={collapsed ? 'Expand navigation' : 'Collapse navigation'}
              className="hidden min-h-[40px] min-w-[40px] items-center justify-center rounded-lg border border-zinc-300 text-lg lg:inline-flex dark:border-zinc-700"
            >
              <span aria-hidden="true">☰</span>
            </button>
            <button
              type="button"
              onClick={() => setDrawer(true)}
              aria-label="Open navigation"
              className="inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded-lg border border-zinc-300 text-lg lg:hidden dark:border-zinc-700"
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

      {/* Drawer mobile */}
      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-label="Navigation">
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setDrawer(false)}
            className="absolute inset-0 bg-black/50"
          />
          <div className="absolute left-0 top-0 flex h-full w-72 flex-col bg-kasuat-black">
            <div className="flex items-center justify-between pr-2">
              <SidebarBrand collapsed={false} />
              <button
                type="button"
                onClick={() => setDrawer(false)}
                aria-label="Close navigation"
                className="inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded-lg text-zinc-200"
              >
                <span aria-hidden="true">✕</span>
              </button>
            </div>
            <div className="min-h-0 flex-1">
              <Sidebar role={role} collapsed={false} onNavigate={() => setDrawer(false)} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
