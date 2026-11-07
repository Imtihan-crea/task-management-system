/**
 * Uji matriks izin lib/auth/permissions.ts (aturan role di sisi aplikasi).
 * Jalankan: npm run test:permissions
 */
import { can, isAdmin } from '../lib/auth/permissions'
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
const hanya = (perm: Parameters<typeof can>[1], boleh: UserRole[]) => {
  for (const r of ROLES) cek(`${perm} untuk ${r}`, can(r, perm), boleh.includes(r))
}

/* ---------- kelola user: hanya ADMIN ---------- */
for (const p of ['users.view', 'users.invite', 'users.edit', 'users.changeRole', 'users.activate', 'users.deactivate'] as const) {
  hanya(p, ['ADMIN'])
}

/* ---------- kelola project/task/workstream: ADMIN + PM ---------- */
for (const p of [
  'projects.create', 'projects.edit',
  'workstreams.create', 'workstreams.edit', 'workstreams.delete',
  'tasks.create', 'tasks.edit', 'tasks.delete',
  'suggestions.review',
  'meetings.edit', 'meetings.complete', 'meetings.cancel', 'meetings.manageParticipants',
] as const) {
  hanya(p, ['ADMIN', 'PROJECT_MANAGER'])
}

/* ---------- aksi anggota tim ---------- */
for (const p of ['tasks.changeStatusOwn', 'tasks.submitEvidenceOwn', 'suggestions.create', 'meetings.create'] as const) {
  hanya(p, ['ADMIN', 'PROJECT_MANAGER', 'TEAM_MEMBER'])
}

/* ---------- semua role boleh lihat ---------- */
for (const p of ['profile.viewOwn', 'profile.editOwn', 'projects.view', 'tasks.view', 'meetings.view'] as const) {
  hanya(p, ROLES)
}

/* ---------- isAdmin ---------- */
for (const r of ROLES) cek(`isAdmin(${r})`, isAdmin(r), r === 'ADMIN')

console.log(`LULUS: ${ok}`)
console.log(`GAGAL: ${gagal}`)
if (gagal > 0) process.exit(1)
