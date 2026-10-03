import type { ReactNode } from 'react'
import { requireProfile } from '@/lib/auth/session'
import { Shell } from '@/components/layout/Shell'

/**
 * Kerangka halaman protected: cek session + application shell.
 * Sidebar/header tetap mounted saat content berubah (§5).
 */
export async function AppShell({ children }: { children: ReactNode }) {
  const profile = await requireProfile()

  return (
    <Shell
      role={profile.role}
      email={profile.email}
      name={profile.full_name || profile.email}
    >
      {children}
    </Shell>
  )
}
