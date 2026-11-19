/**
 * Uji lib/portal/apps.ts: aplikasi aktif dari path dan kartu Portal per peran.
 * Jalankan: npm run test:portal
 */
import { activeApp, MENU_PERMISSIONS, visibleApps, visibleItems, PORTAL_APPS } from '../lib/portal/apps'
import { can, type Permission } from '../lib/auth/permissions'
import type { UserRole } from '../types/profile'

let ok = 0
let gagal = 0
function cek(label: string, aktual: unknown, harap: unknown): void {
  if (JSON.stringify(aktual) === JSON.stringify(harap)) ok++
  else {
    gagal++
    console.log(`  [GAGAL] ${label} -> ${JSON.stringify(aktual)} (harus ${JSON.stringify(harap)})`)
  }
}

// Aplikasi aktif: href terpanjang menang; halaman umum = null.
const PATHS: [string, string | null][] = [
  ['/dashboard', 'project'],
  ['/projects/abc', 'project'],
  ['/tasks/new', 'project'],
  ['/task-suggestions/1', 'project'],
  ['/meetings/xyz', 'meeting'],
  ['/tracker', 'hr'],
  ['/tracker/rekap', 'hr'],
  ['/tracker/import', 'hr'],
  ['/settings/hr', 'hr'],
  ['/settings', 'admin'],
  ['/cuti/persetujuan', 'cuti'],
  ['/clients/new', 'clients'],
  ['/users/1', 'admin'],
  ['/update-log', 'admin'],
  ['/portal', null],
  ['/profile', null],
  ['/notifications', null],
  ['/projectsx', null],
]
for (const [path, key] of PATHS) cek(`aktif ${path}`, activeApp(path)?.key ?? null, key)

// Izin menu dari paket peran (sama dengan menuPermissions di server tanpa aturan per akun).
const allowedFor = (role: UserRole) => {
  const has = (p: Permission) => can(role, p)
  const list = MENU_PERMISSIONS.filter((p) => p !== 'leave.approve' && p !== 'clients.view' && has(p as Permission))
  if (has('leave.approve') || has('hr.manage')) list.push('leave.approve')
  if (has('clients.view') || has('clients.manage')) list.push('clients.view')
  return list
}
const cards = (role: UserRole) => visibleApps(allowedFor(role)).map((a) => a.key)
cek('kartu Admin', cards('ADMIN'), ['project', 'meeting', 'hr', 'cuti', 'clients', 'admin'])
cek('kartu PM', cards('PROJECT_MANAGER'), ['project', 'meeting', 'hr', 'cuti', 'clients', 'admin'])
cek('kartu Project Officer', cards('TEAM_MEMBER'), ['project', 'meeting', 'hr', 'cuti', 'clients', 'admin'])
cek('kartu Guest (Client Management ditahan)', cards('VIEWER'), ['project', 'meeting', 'hr', 'cuti', 'admin'])

const menu = (role: UserRole, key: string) =>
  visibleItems(PORTAL_APPS.find((a) => a.key === key)!, allowedFor(role)).map((i) => i.href)
cek('menu HR Admin', menu('ADMIN', 'hr'), ['/tracker', '/tracker/rekap', '/settings/hr'])
cek('menu HR PO', menu('TEAM_MEMBER', 'hr'), ['/tracker', '/tracker/rekap'])
cek('menu HR Guest', menu('VIEWER', 'hr'), ['/tracker'])
cek('menu Admin & Sistem PM', menu('PROJECT_MANAGER', 'admin'), ['/settings', '/activity', '/update-log'])
cek('menu Cuti PM', menu('PROJECT_MANAGER', 'cuti'), ['/cuti'])
cek('menu Project Guest', menu('VIEWER', 'project'), ['/dashboard', '/projects', '/workstreams', '/tasks'])

// Tanpa izin apa pun: kartu tanpa menu yang boleh dibuka tidak tampil.
cek('tanpa izin', visibleApps([]).map((a) => a.key), ['project', 'hr', 'cuti', 'admin'])

console.log(`LULUS: ${ok}`)
console.log(`GAGAL: ${gagal}`)
if (gagal > 0) process.exit(1)
