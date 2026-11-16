/**
 * Uji lib/auth/super-admin.ts — aturan Super Admin.
 * Jalankan: npm run test:super-admin
 */
import {
  MSG_SUPER_LOCKED,
  MSG_SUPER_ONLY_ADMIN,
  MSG_SUPER_ONLY_PROMOTE,
  newUserRoleError,
  superAdminError,
} from '../lib/auth/super-admin'

let ok = 0
let gagal = 0
function cek(label: string, aktual: unknown, harap: unknown): void {
  if (JSON.stringify(aktual) === JSON.stringify(harap)) ok++
  else {
    gagal++
    console.log(`  [GAGAL] ${label} -> ${JSON.stringify(aktual)} (harus ${JSON.stringify(harap)})`)
  }
}

const superA = { id: 's', isSuper: true }
const adminA = { id: 'a', isSuper: false }
const superT = { id: 's', role: 'ADMIN' as const, isSuper: true }
const adminT = { id: 'b', role: 'ADMIN' as const, isSuper: false }
const memberT = { id: 'm', role: 'TEAM_MEMBER' as const, isSuper: false }

cek('super ubah admin lain', superAdminError(superA, adminT, { role: 'TEAM_MEMBER' }), null)
cek('super angkat admin', superAdminError(superA, memberT, { role: 'ADMIN' }), null)
cek('admin ubah admin lain', superAdminError(adminA, adminT, { status: 'INACTIVE' }), MSG_SUPER_ONLY_ADMIN)
cek('admin ubah super', superAdminError(adminA, superT), MSG_SUPER_ONLY_ADMIN)
cek('admin reset password admin lain', superAdminError(adminA, adminT), MSG_SUPER_ONLY_ADMIN)
cek('admin ubah diri sendiri', superAdminError(adminA, { ...adminT, id: 'a' }, { role: 'ADMIN' }), null)
cek('admin angkat member jadi admin', superAdminError(adminA, memberT, { role: 'ADMIN' }), MSG_SUPER_ONLY_PROMOTE)
cek('admin ubah member', superAdminError(adminA, memberT, { role: 'PROJECT_MANAGER' }), null)
cek('super turunkan diri', superAdminError(superA, superT, { role: 'TEAM_MEMBER' }), MSG_SUPER_LOCKED)
cek('super nonaktif', superAdminError(superA, superT, { status: 'INACTIVE' }), MSG_SUPER_LOCKED)
cek('super ubah nama sendiri', superAdminError(superA, superT, { role: 'ADMIN', status: 'ACTIVE' }), null)
cek('user baru admin oleh admin', newUserRoleError(false, 'ADMIN'), MSG_SUPER_ONLY_PROMOTE)
cek('user baru admin oleh super', newUserRoleError(true, 'ADMIN'), null)
cek('user baru member oleh admin', newUserRoleError(false, 'TEAM_MEMBER'), null)

console.log(`LULUS: ${ok}`)
console.log(`GAGAL: ${gagal}`)
if (gagal > 0) process.exit(1)
