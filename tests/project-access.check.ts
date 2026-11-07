/**
 * Uji lib/auth/project-access.ts — aturan izin berbasis project dan Rule 06.
 * Jalankan: npm run test:project-access
 */
import { canManageProject, canSuggestForProject, removesLastActiveAdmin } from '../lib/auth/project-access'

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

/* ---------- canManageProject ---------- */
cek('ADMIN tanpa PM', canManageProject('ADMIN', false), true)
cek('PM project ini', canManageProject('PROJECT_MANAGER', true), true)
cek('PM project lain', canManageProject('PROJECT_MANAGER', false), false)
cek('TEAM_MEMBER walau ditandai PM', canManageProject('TEAM_MEMBER', true), false)
cek('VIEWER', canManageProject('VIEWER', true), false)
cek('role tak dikenal', canManageProject('HACKER', true), false)

/* ---------- canSuggestForProject ---------- */
cek('suggest ADMIN', canSuggestForProject('ADMIN', { managesProject: false, hasAssignedTask: false }), true)
cek('suggest PM project ini', canSuggestForProject('PROJECT_MANAGER', { managesProject: true, hasAssignedTask: false }), true)
cek('suggest PM project lain walau punya task', canSuggestForProject('PROJECT_MANAGER', { managesProject: false, hasAssignedTask: true }), false)
cek('suggest TM punya task', canSuggestForProject('TEAM_MEMBER', { managesProject: false, hasAssignedTask: true }), true)
cek('suggest TM tanpa task', canSuggestForProject('TEAM_MEMBER', { managesProject: false, hasAssignedTask: false }), false)

/* ---------- removesLastActiveAdmin (Rule 06) ---------- */
const A = { role: 'ADMIN' as const, status: 'ACTIVE' as const }
cek('admin terakhir diturunkan', removesLastActiveAdmin({ current: A, next: { role: 'TEAM_MEMBER', status: 'ACTIVE' }, otherActiveAdmins: 0 }), true)
cek('admin terakhir dinonaktifkan', removesLastActiveAdmin({ current: A, next: { role: 'ADMIN', status: 'INACTIVE' }, otherActiveAdmins: 0 }), true)
cek('masih ada admin lain', removesLastActiveAdmin({ current: A, next: { role: 'TEAM_MEMBER', status: 'ACTIVE' }, otherActiveAdmins: 1 }), false)
cek('tetap admin aktif', removesLastActiveAdmin({ current: A, next: A, otherActiveAdmins: 0 }), false)
cek('target bukan admin', removesLastActiveAdmin({ current: { role: 'PROJECT_MANAGER', status: 'ACTIVE' }, next: { role: 'VIEWER', status: 'ACTIVE' }, otherActiveAdmins: 0 }), false)
cek('target admin nonaktif', removesLastActiveAdmin({ current: { role: 'ADMIN', status: 'INACTIVE' }, next: { role: 'TEAM_MEMBER', status: 'INACTIVE' }, otherActiveAdmins: 0 }), false)

console.log(`LULUS: ${ok}`)
console.log(`GAGAL: ${gagal}`)
if (gagal > 0) process.exit(1)
