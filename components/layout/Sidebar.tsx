'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { KasuatLogo } from '@/components/brand/KasuatLogo'

type NavItem = {
  href: string
  label: string
  permission: string | null
  icon: React.ReactNode
}

function Icon({ d }: { d: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5 shrink-0"
    >
      <path d={d} />
    </svg>
  )
}

const GROUPS: { title: string | null; items: Omit<NavItem, 'icon'>[] }[] = [
  {
    title: null,
    items: [{ href: '/dashboard', label: 'Dashboard', permission: null }],
  },
  {
    title: 'MANAJEMEN PROJECT',
    items: [
      { href: '/projects', label: 'Projects', permission: 'projects.view' },
      { href: '/workstreams', label: 'Workstreams', permission: 'projects.view' },
      { href: '/tasks', label: 'Tasks', permission: 'tasks.view' },
    ],
  },
  {
    title: 'KOLABORASI',
    items: [
      { href: '/meetings', label: 'Meetings', permission: 'meetings.view' },
      { href: '/tracker', label: 'Daily Tracker', permission: null },
      { href: '/cuti', label: 'Cuti & Izin', permission: null },
      { href: '/cuti/persetujuan', label: 'Persetujuan Cuti', permission: 'leave.approve' },
      { href: '/task-suggestions', label: 'Task Suggestions', permission: 'suggestions.create' },
    ],
  },
  {
    title: 'KLIEN',
    items: [{ href: '/clients', label: 'Client Management', permission: 'clients.view' }],
  },
  {
    title: 'PEMANTAUAN',
    items: [{ href: '/activity', label: 'Activity Log', permission: null }],
  },
  {
    title: 'SISTEM',
    items: [
      { href: '/users', label: 'Users', permission: 'users.view' },
      { href: '/master-reference', label: 'Master Reference', permission: 'reference.manage' },
      { href: '/settings/hr', label: 'Pengaturan HR', permission: 'hr.manage' },
      { href: '/settings', label: 'Pengaturan', permission: null },
      { href: '/update-log', label: 'Update Log', permission: null },
    ],
  },
]

const ALL_HREFS = GROUPS.flatMap((g) => g.items.map((i) => i.href))

const ICONS: Record<string, string> = {
  '/clients': 'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75',
  '/cuti': 'M8 7V3m8 4V3M4 11h16M5 5h14a1 1 0 011 1v13a1 1 0 01-1 1H5a1 1 0 01-1-1V6a1 1 0 011-1zm4 10h6',
  '/cuti/persetujuan': 'M9 12l2 2 4-4M5 5h14a1 1 0 011 1v13a1 1 0 01-1 1H5a1 1 0 01-1-1V6a1 1 0 011-1z',
  '/settings/hr': 'M8 7V3m8 4V3M4 11h16M5 5h14a1 1 0 011 1v13a1 1 0 01-1 1H5a1 1 0 01-1-1V6a1 1 0 011-1z',
  '/master-reference': 'M4 6h16M4 12h16M4 18h10',
  '/tracker': 'M12 8v4l3 2M3 12a9 9 0 1018 0 9 9 0 00-18 0zM8 3h8',
  '/update-log': 'M12 8v4l3 2M3 12a9 9 0 1018 0 9 9 0 00-18 0z',
  '/dashboard': 'M3 12l9-9 9 9M5 10v10h5v-6h4v6h5V10',
  '/projects': 'M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z',
  '/workstreams': 'M4 6h16M4 12h16M4 18h16',
  '/tasks': 'M9 11l3 3 8-8M5 21h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2z',
  '/meetings': 'M8 2v4M16 2v4M3 8h18M5 4h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z',
  '/task-suggestions': 'M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2v10z',
  '/activity': 'M22 12h-4l-3 9L9 3l-3 9H2',
  '/users': 'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75',
  '/settings': 'M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09a1.65 1.65 0 001.51-1 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33h.01a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51h.01a1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82v.01a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z',
}

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

  return (
    <nav aria-label="Navigasi utama" className="flex h-full flex-col gap-1 overflow-y-auto p-3">
      {GROUPS.map((group) => {
        const visible = group.items.filter(
          (item) => item.permission === null || allowed.includes(item.permission)
        )
        if (visible.length === 0) return null
        return (
          <div key={group.title ?? 'main'}>
            {group.title && !collapsed && (
              <p className="px-3 pb-1 pt-3 text-[11px] font-semibold tracking-wider text-zinc-400">
                {group.title}
              </p>
            )}
            {group.title && collapsed && <div className="pt-3" />}
            {visible.map((item) => {
              // Menu dengan href terpanjang yang cocok menang (/settings/hr bukan /settings).
              const matches = (href: string) => pathname === href || (href !== '/dashboard' && pathname.startsWith(href + '/'))
              const active = matches(item.href) && !ALL_HREFS.some((h) => h.length > item.href.length && h.startsWith(item.href) && matches(h))
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  title={collapsed ? item.label : undefined}
                  onClick={onNavigate}
                  className={`flex min-h-[40px] items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    collapsed ? 'justify-center' : ''
                  } ${
                    active
                      ? 'bg-kasuat-gold text-kasuat-black'
                      : 'text-zinc-200 hover:bg-zinc-800'
                  }`}
                >
                  <Icon d={ICONS[item.href] ?? ''} />
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </Link>
              )
            })}
          </div>
        )
      })}
    </nav>
  )
}

export function SidebarBrand({ collapsed }: { collapsed?: boolean }) {
  if (!collapsed) {
    return (
      <Link href="/dashboard" aria-label="Kasuat, ke Dashboard" className="flex h-14 items-center px-6">
        <KasuatLogo />
      </Link>
    )
  }
  // Mode icon: hanya area mark dari aset resmi (bukan redraw).
  return (
    <Link href="/dashboard" aria-label="Kasuat, ke Dashboard" className="flex h-14 items-center justify-center px-2">
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
