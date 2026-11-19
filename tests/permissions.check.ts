/**
 * Uji matriks izin lib/auth/permissions.ts: bagan wewenang Kasuat (COA, 19 Nov 2026).
 * Satu baris COA x empat peran. Jalankan: npm run test:permissions
 */
import { can, isAdmin, type Permission } from '../lib/auth/permissions'
import { ROLE_LABELS } from '../lib/auth/roles'
import { PERMISSION_SCOPE } from '../lib/auth/access'
import type { UserRole } from '../types/profile'

let ok = 0
let gagal = 0

function cek(label: string, aktual: unknown, harap: unknown): void {
  if (JSON.stringify(aktual) === JSON.stringify(harap)) {
    ok++
  } else {
    gagal++
    console.log(`  [GAGAL] ${label} -> ${JSON.stringify(aktual)} (harus ${JSON.stringify(harap)})`)
  }
}

const ROLES: UserRole[] = ['ADMIN', 'PROJECT_MANAGER', 'TEAM_MEMBER', 'VIEWER']
const A = 'ADMIN', PM = 'PROJECT_MANAGER', PO = 'TEAM_MEMBER', G = 'VIEWER'

/** Baris matriks COA: izin -> peran yang mendapatkannya dari paket peran. */
const COA: [string, Permission[], UserRole[]][] = [
  ['Lihat tracker & rekap jam semua karyawan', ['hr.view'], [A, PM, PO]],
  ['Kelola data HR', ['hr.manage'], [A]],
  ['Lihat & komentari tracker anggota project', ['tracker.review'], [A, PM, PO]],
  ['Kelola Master Reference', ['reference.manage'], [A]],
  ['Setujui/tolak cuti', ['leave.approve'], [A]],
  // Guest ditahan (GUEST_HELD) sampai konfirmasi pemilik.
  ['Kelola meeting', ['meetings.edit', 'meetings.complete', 'meetings.cancel', 'meetings.manageParticipants'], [A, PM, PO]],
  ['Lihat Client Management', ['clients.view'], [A, PM, PO]],
  ['Kelola lead', ['clients.manage'], [A]],
  ['Users', ['users.view', 'users.invite', 'users.edit', 'users.changeRole', 'users.activate', 'users.deactivate'], [A]],
  ['Buat project', ['projects.create'], [A]],
  ['Ubah project dan PM-nya', ['projects.edit'], [A]],
  ['Workstream', ['workstreams.create', 'workstreams.edit', 'workstreams.delete'], [A, PM]],
  ['Buat dan import task', ['tasks.create'], [A, PM, PO]],
  ['Ubah semua task', ['tasks.edit'], [A, PM, PO]],
  ['Batalkan task', ['tasks.cancel'], [A, PM]],
  ['Hapus task', ['tasks.delete'], [A, PM]],
  ['Setujui / tolak usulan task', ['suggestions.review'], [A, PM]],
  // Izin yang tidak disebut COA: tetap seperti sebelumnya.
  ['Kerja milik sendiri', ['tasks.changeStatusOwn', 'tasks.submitEvidenceOwn', 'suggestions.create', 'meetings.create'], [A, PM, PO]],
  ['Lihat', ['profile.viewOwn', 'profile.editOwn', 'projects.view', 'tasks.view', 'meetings.view'], [A, PM, PO, G]],
  ['Kelola wewenang (hanya Super Admin)', ['permissions.manage'], []],
]

for (const [baris, perms, boleh] of COA) {
  for (const p of perms) {
    for (const r of ROLES) cek(`${baris}: ${p} untuk ${ROLE_LABELS[r]}`, can(r, p), boleh.includes(r))
  }
}

const covered = new Set<string>(COA.flatMap(([, p]) => p))
cek('semua izin tercakup matriks', Object.keys(PERMISSION_SCOPE).filter((p) => !covered.has(p)), [])

/* ---------- label peran COA ---------- */
cek('label peran', ROLES.map((r) => ROLE_LABELS[r]), ['Admin', 'Project Manager', 'Project Officer', 'Guest'])

/* ---------- isAdmin ---------- */
for (const r of ROLES) cek(`isAdmin(${r})`, isAdmin(r), r === 'ADMIN')

console.log(`LULUS: ${ok}`)
console.log(`GAGAL: ${gagal}`)
if (gagal > 0) process.exit(1)
