import type { ReactNode } from 'react'
import { requireProfile } from '@/lib/auth/session'
import { Nav } from '@/components/layout/Nav'
import { NotificationBell } from '@/components/notifications/NotificationBell'

/**
 * Kerangka halaman protected: cek session + tampilkan navigasi.
 * Dipakai oleh /dashboard, /users, /users/[id], dan /profile.
 */
export async function AppShell({ children }: { children: ReactNode }) {
  const profile = await requireProfile()

  return (
    <div className="flex min-h-screen flex-col bg-kasuat-off-white dark:bg-black">
      <Nav role={profile.role} email={profile.email} bell={<NotificationBell userId={profile.id} />} />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
        {children}
      </main>
    </div>
  )
}
