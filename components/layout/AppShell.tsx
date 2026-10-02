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
    <div className="flex min-h-screen flex-col bg-zinc-50 dark:bg-black">
      <div className="bg-white dark:bg-zinc-900">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-end px-4 pt-2">
          <NotificationBell userId={profile.id} />
        </div>
        <Nav role={profile.role} email={profile.email} />
      </div>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
        {children}
      </main>
    </div>
  )
}
