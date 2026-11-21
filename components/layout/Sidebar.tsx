'use client'

import { HOME_PATH, PORTAL_ENABLED } from '@/lib/portal/flag'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { KasuatLogo } from '@/components/brand/KasuatLogo'
import { NAV_ICONS, NavIcon } from '@/components/layout/nav-icons'
import { activeApp, activeItem, visibleApps, visibleItems } from '@/lib/portal/apps'

const LINK = 'flex min-h-[44px] items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors'
const IDLE = 'text-zinc-200 hover:bg-zinc-800'
const ACTIVE = 'bg-kasuat-gold text-kasuat-black'

function NavLink({
  href,
  label,
  active,
  collapsed,
  onNavigate,
}: {
  href: string
  label: string
  active: boolean
  collapsed?: boolean
  onNavigate?: () => void
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      title={collapsed ? label : undefined}
      onClick={onNavigate}
      className={`${LINK} ${collapsed ? 'justify-center' : ''} ${active ? ACTIVE : IDLE}`}
    >
      <NavIcon d={NAV_ICONS[href] ?? ''} />
      {!collapsed && <span className="truncate">{label}</span>}
    </Link>
  )
}

/**
 * Sidebar mengikuti aplikasi aktif (Portal, pola Meraki): di dalam satu aplikasi
 * hanya menu aplikasi itu + tautan "Semua aplikasi". Di halaman umum (Portal,
 * profil, notifikasi) sidebar berisi daftar aplikasi yang boleh dibuka.
 */
export function Sidebar({
  allowed,
  collapsed,
  onNavigate,
}: {
  /** Izin menu yang dimiliki user (dihitung server di app/(app)/layout.tsx). */
  allowed: string[]
  collapsed?: boolean
  onNavigate?: () => void
}) {
  const pathname = usePathname()
  const app = activeApp(pathname)
  const current = activeItem(pathname)?.item.href

  // Portal mati: menu lengkap semua aplikasi yang boleh dibuka, per kelompok (seperti sebelum Portal).
  if (!PORTAL_ENABLED) {
    return (
      <nav aria-label="Navigasi utama" className="flex h-full flex-col gap-1 overflow-y-auto p-3">
        {visibleApps(allowed).map((a) => (
          <div key={a.key} className="flex flex-col gap-1">
            {!collapsed ? (
              <p className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">{a.title}</p>
            ) : (
              <div className="pt-3" />
            )}
            {visibleItems(a, allowed).map((item) => (
              <NavLink key={item.href} href={item.href} label={item.label} active={item.href === current} collapsed={collapsed} onNavigate={onNavigate} />
            ))}
          </div>
        ))}
      </nav>
    )
  }

  return (
    <nav aria-label="Navigasi utama" className="flex h-full flex-col gap-1 overflow-y-auto p-3">
      <NavLink
        href="/portal"
        label={app ? 'Semua aplikasi' : 'Portal'}
        active={pathname === '/portal'}
        collapsed={collapsed}
        onNavigate={onNavigate}
      />
      {app ? (
        <>
          {!collapsed ? (
            <p className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">{app.title}</p>
          ) : (
            <div className="pt-3" />
          )}
          {visibleItems(app, allowed).map((item) => (
            <NavLink
              key={item.href}
              href={item.href}
              label={item.label}
              active={item.href === current}
              collapsed={collapsed}
              onNavigate={onNavigate}
            />
          ))}
        </>
      ) : (
        <>
          {!collapsed ? (
            <p className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">Aplikasi</p>
          ) : (
            <div className="pt-3" />
          )}
          {visibleApps(allowed).map((a) => {
            const first = visibleItems(a, allowed)[0]
            return (
              <NavLink
                key={a.key}
                href={first.href}
                label={a.title}
                active={false}
                collapsed={collapsed}
                onNavigate={onNavigate}
              />
            )
          })}
        </>
      )}
    </nav>
  )
}

export function SidebarBrand({ collapsed }: { collapsed?: boolean }) {
  if (!collapsed) {
    return (
      <Link href={HOME_PATH} aria-label={PORTAL_ENABLED ? 'Kasuat, ke Portal' : 'Kasuat, ke Dashboard'} className="flex h-14 items-center px-6">
        <KasuatLogo />
      </Link>
    )
  }
  // Mode icon: hanya area mark dari aset resmi (bukan redraw).
  return (
    <Link href={HOME_PATH} aria-label={PORTAL_ENABLED ? 'Kasuat, ke Portal' : 'Kasuat, ke Dashboard'} className="flex h-14 items-center justify-center px-2">
      <span className="block w-7 overflow-hidden" aria-hidden="true">
        <Image
          src="/brand/kasuat-logo-white.png"
          alt=""
          height={26}
          width={87} // rasio aset 1229x369
          style={{ height: 26, width: 'auto', maxWidth: 'none' }}
        />
      </span>
    </Link>
  )
}
