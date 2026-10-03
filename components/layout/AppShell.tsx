import type { ReactNode } from 'react'

/**
 * Pembungkus konten halaman (dulu memuat Nav + auth).
 * Auth + shell kini di app/(app)/layout.tsx sehingga persisten
 * antar navigasi. Komponen ini dipertahankan agar tidak mengubah
 * semua page sekaligus (§85: extend, do not rewrite).
 */
export function AppShell({ children }: { children: ReactNode }) {
  return <>{children}</>
}
