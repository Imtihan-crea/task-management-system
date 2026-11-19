/**
 * Aplikasi di Portal (pola Meraki Platform: login sekali -> Portal -> satu aplikasi).
 * TMS satu aplikasi dan satu database; "aplikasi" di sini hanya kelompok menu.
 * Akses tetap dicek server di setiap halaman; daftar ini hanya menentukan apa yang tampil.
 * Murni (tanpa I/O) supaya dipakai Sidebar (client), Portal (server), dan tes.
 */

export type AppItem = { href: string; label: string; permission: string | null }
export type PortalApp = { key: string; title: string; description: string; items: AppItem[] }

export const PORTAL_APPS: PortalApp[] = [
  {
    key: 'project',
    title: 'Project & Task',
    description: 'Dashboard, project, workstream, task, dan usulan task.',
    items: [
      { href: '/dashboard', label: 'Dashboard', permission: null },
      { href: '/projects', label: 'Projects', permission: 'projects.view' },
      { href: '/workstreams', label: 'Workstreams', permission: 'projects.view' },
      { href: '/tasks', label: 'Tasks', permission: 'tasks.view' },
      { href: '/task-suggestions', label: 'Task Suggestions', permission: 'suggestions.create' },
    ],
  },
  {
    key: 'meeting',
    title: 'Meeting',
    description: 'Jadwal, notulen, keputusan, dan action item meeting.',
    items: [{ href: '/meetings', label: 'Meetings', permission: 'meetings.view' }],
  },
  {
    key: 'hr',
    title: 'Daily Tracker & HR',
    description: 'Isi Daily Tracker, rekap jam karyawan, dan pengaturan HR.',
    items: [
      { href: '/tracker', label: 'Daily Tracker', permission: null },
      { href: '/tracker/rekap', label: 'Rekap', permission: 'hr.view' },
      { href: '/settings/hr', label: 'Pengaturan HR', permission: 'hr.manage' },
    ],
  },
  {
    key: 'cuti',
    title: 'Cuti',
    description: 'Ajukan cuti, izin, atau sakit dan pantau statusnya.',
    items: [
      { href: '/cuti', label: 'Cuti', permission: null },
      { href: '/cuti/persetujuan', label: 'Persetujuan Cuti', permission: 'leave.approve' },
    ],
  },
  {
    key: 'clients',
    title: 'Client Management',
    description: 'Pipeline lead dan data klien.',
    items: [{ href: '/clients', label: 'Clients', permission: 'clients.view' }],
  },
  {
    key: 'admin',
    title: 'Admin & Sistem',
    description: 'User, Master Reference, pengaturan, log aktivitas, dan catatan rilis.',
    items: [
      { href: '/users', label: 'Users', permission: 'users.view' },
      { href: '/master-reference', label: 'Master Reference', permission: 'reference.manage' },
      { href: '/settings', label: 'Pengaturan', permission: null },
      { href: '/activity', label: 'Activity Log', permission: null },
      { href: '/update-log', label: 'Update Log', permission: null },
    ],
  },
]

const ALL_ITEMS = PORTAL_APPS.flatMap((app) => app.items.map((item) => ({ app, item })))

const matches = (pathname: string, href: string) => pathname === href || pathname.startsWith(href + '/')

/** Menu yang cocok dengan path: href terpanjang menang (/settings/hr bukan /settings). */
export function activeItem(pathname: string): { app: PortalApp; item: AppItem } | null {
  let best: { app: PortalApp; item: AppItem } | null = null
  for (const hit of ALL_ITEMS) {
    if (matches(pathname, hit.item.href) && (!best || hit.item.href.length > best.item.href.length)) best = hit
  }
  return best
}

/** Aplikasi yang sedang dibuka; null = halaman umum (Portal, profil, notifikasi). */
export const activeApp = (pathname: string) => activeItem(pathname)?.app ?? null

/** Menu aplikasi yang boleh dibuka user (izin menu dihitung server). */
export const visibleItems = (app: PortalApp, allowed: string[]) =>
  app.items.filter((item) => item.permission === null || allowed.includes(item.permission))

/** Kartu Portal: aplikasi tanpa satu pun menu yang boleh dibuka tidak tampil. */
export const visibleApps = (allowed: string[]) => PORTAL_APPS.filter((app) => visibleItems(app, allowed).length > 0)

/** Izin yang dipakai menu (untuk dihitung sekali di server). */
export const MENU_PERMISSIONS = [
  ...new Set(PORTAL_APPS.flatMap((app) => app.items.map((item) => item.permission)).filter((p): p is string => p !== null)),
]
