import type { ReactNode } from 'react'
import { requireProfile } from '@/lib/auth/session'
import { Shell } from '@/components/layout/Shell'
import { hasPermission } from '@/lib/auth/current-access'
import type { Permission } from '@/lib/auth/permissions'

const MENU_PERMISSIONS: Permission[] = ['projects.view', 'tasks.view', 'meetings.view', 'suggestions.create', 'users.view']

/**
 * Layout grup (app): shell persisten (sidebar + header tetap mounted
 * saat content/workspce berubah, §5). Auth dicek sekali di sini;
 * AppShell di tiap page kini hanya pembungkus konten.
 */
export default async function AppGroupLayout({ children }: { children: ReactNode }) {
  const profile = await requireProfile()
  // Menu ikut wewenang efektif (peran + aturan per akun), bukan peran saja.
  const allowed = (
    await Promise.all(MENU_PERMISSIONS.map(async (p) => ((await hasPermission(profile.id, p)) ? p : null)))
  ).filter((p): p is Permission => p !== null)

  return (
    <Shell
      role={profile.role}
      allowed={allowed}
      email={profile.email}
      name={profile.full_name || profile.email}
    >
      {children}
    </Shell>
  )
}
