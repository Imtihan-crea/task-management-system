import type { ReactNode } from 'react'
import { requireProfile } from '@/lib/auth/session'
import { Shell } from '@/components/layout/Shell'

/**
 * Layout grup (app): shell persisten (sidebar + header tetap mounted
 * saat content/workspce berubah, §5). Auth dicek sekali di sini;
 * AppShell di tiap page kini hanya pembungkus konten.
 */
export default async function AppGroupLayout({ children }: { children: ReactNode }) {
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
