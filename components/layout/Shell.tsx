'use client'

import { useState } from 'react'
import type { UserRole } from '@/types/profile'
import { Sidebar, SidebarBrand } from '@/components/layout/Sidebar'
import { PickerOnClick } from '@/components/layout/PickerOnClick'
import { BellPopover, GlobalSearch, ProfileMenu } from '@/components/layout/Topbar'

const STORAGE_KEY = 'kasuat.sidebar.collapsed'

function MenuIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="h-5 w-5">
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  )
}

/**
 * Persistent application shell (§5): sidebar + header tetap mounted
 * saat content berubah. Desktop: sidebar persisten (expanded/collapsed
 * icon). Mobile: drawer overlay. Toggle selalu garis tiga (§4).
 */
export function Shell({
  role,
  allowed,
  email,
  name,
  children,
}: {
  role: UserRole
  allowed: string[]
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
      <PickerOnClick />
      {/* Sidebar desktop persisten */}
      <aside
        className={`sticky top-0 hidden h-screen shrink-0 flex-col bg-kasuat-black transition-[width] duration-200 lg:flex ${
          collapsed ? 'w-16' : 'w-60'
        }`}
      >
        {/* Sejajar dengan topbar di panel berbingkai (panel mulai 12px dari atas, topbar 56px). */}
        <div className="pt-3">
          <SidebarBrand collapsed={collapsed} />
        </div>
        <div className="min-h-0 flex-1">
          <Sidebar allowed={allowed} collapsed={collapsed} />
        </div>
      </aside>

      {/* Panel besar berbingkai di layar lebar, konten selebar layar (pola FMS/IMS, 16 Nov 2026). */}
      <div className="flex min-w-0 flex-1 flex-col lg:p-3">
        <div className="flex min-w-0 flex-1 flex-col lg:rounded-2xl lg:border lg:border-zinc-200 lg:bg-zinc-50 dark:lg:border-zinc-800 dark:lg:bg-zinc-950">
        {/* Topbar */}
        <header className="sticky top-0 z-40 border-b border-zinc-200 bg-white/95 backdrop-blur lg:rounded-t-2xl dark:border-zinc-800 dark:bg-zinc-900/95">
          <div className="mx-auto flex h-14 w-full max-w-7xl items-center gap-2 px-3 lg:max-w-none lg:px-6">
            <button
              type="button"
              onClick={toggleDesktop}
              aria-label={collapsed ? 'Perluas navigasi' : 'Ciutkan navigasi'}
              aria-expanded={!collapsed}
              title={collapsed ? 'Perluas navigasi' : 'Ciutkan navigasi'}
              className="hidden min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-zinc-600 hover:bg-zinc-100 hover:text-kasuat-black lg:inline-flex dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
            >
              <MenuIcon />
            </button>
            <button
              type="button"
              onClick={() => setDrawer(true)}
              aria-label="Buka navigasi"
              className="-ml-1 inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-zinc-800 hover:bg-zinc-100 lg:hidden dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              <MenuIcon />
            </button>
            <GlobalSearch />
            <div className="ml-auto flex items-center gap-1">
              <BellPopover />
              <ProfileMenu name={name} email={email} role={role} />
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-7xl flex-1 px-3 py-4 lg:max-w-none lg:px-6 lg:py-5">{children}</main>

        <footer className="mx-auto w-full max-w-7xl px-3 pb-4 lg:max-w-none lg:px-6">
          <p className="text-center text-xs text-zinc-600 dark:text-zinc-400">
            kasuat.co &middot; v1.10.0
          </p>
        </footer>
        </div>
      </div>

      {/* Drawer mobile */}
      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-label="Navigasi">
          <button
            type="button"
            aria-label="Tutup navigasi"
            onClick={() => setDrawer(false)}
            className="absolute inset-0 bg-black/50"
          />
          <div className="absolute left-0 top-0 flex h-full w-72 flex-col bg-kasuat-black">
            <div className="flex items-center justify-between pr-2">
              <SidebarBrand collapsed={false} />
              <button
                type="button"
                onClick={() => setDrawer(false)}
                aria-label="Tutup navigasi"
                className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-zinc-200"
              >
                <span aria-hidden="true">✕</span>
              </button>
            </div>
            <div className="min-h-0 flex-1">
              <Sidebar allowed={allowed} collapsed={false} onNavigate={() => setDrawer(false)} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
