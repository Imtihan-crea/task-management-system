import type { ReactNode } from 'react'
import { requireProfile } from '@/lib/auth/session'
import { Shell } from '@/components/layout/Shell'
import { loadAccess, menuPermissions } from '@/lib/auth/current-access'
import { roleLabel } from '@/lib/auth/roles'

/**
 * Layout grup (app): shell persisten (sidebar + header tetap mounted
 * saat content/workspce berubah, §5). Auth dicek sekali di sini;
 * AppShell di tiap page kini hanya pembungkus konten.
 */
export default async function AppGroupLayout({ children }: { children: ReactNode }) {
  const profile = await requireProfile()
  // Menu ikut wewenang efektif (peran + aturan per akun), bukan peran saja.
  const [allowed, access] = await Promise.all([menuPermissions(profile.id), loadAccess(profile.id)])

  return (
    <Shell
      roleLabel={roleLabel({ role: profile.role, is_super_admin: access.isSuperAdmin, is_developer: access.isDeveloper })}
      allowed={allowed}
      email={profile.email}
      name={profile.full_name || profile.email}
    >
      {children}
    </Shell>
  )
}
