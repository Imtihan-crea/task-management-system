/**
 * Uji lib/auth/user-status.ts — aturan perubahan status user (rule 05, A7)
 * dan removesLastActiveAdmin (rule 06).
 * Jalankan: npm run test:user-status
 */
import {
  MSG_INVALID_STATUS,
  MSG_INVITED_NOT_ACCEPTED,
  MSG_INVITED_QUICK,
  MSG_SELF_DEACTIVATE,
  MSG_SELF_STATUS,
  quickStatusChangeError,
  quickStatusTargetError,
  userEditStatusError,
} from '../lib/auth/user-status'
import { removesLastActiveAdmin } from '../lib/auth/project-access'
import type { UserRole, UserStatus } from '../types/profile'

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

const ME = 'a'
const OTHER = 'b'

// updateUser: [target, current, next, error]
const edit: [string, UserStatus, UserStatus, string | null][] = [
  [OTHER, 'ACTIVE', 'INACTIVE', null],
  [OTHER, 'INACTIVE', 'ACTIVE', null],
  [OTHER, 'ACTIVE', 'ACTIVE', null],
  [OTHER, 'INVITED', 'INVITED', null], // edit nama/role saja
  [ME, 'ACTIVE', 'ACTIVE', null], // ubah nama sendiri
  [ME, 'ACTIVE', 'INACTIVE', MSG_SELF_STATUS],
  [ME, 'ACTIVE', 'INVITED', MSG_SELF_STATUS], // self menang atas "INVITED tidak valid"
  [OTHER, 'ACTIVE', 'INVITED', MSG_INVALID_STATUS],
  [OTHER, 'INACTIVE', 'INVITED', MSG_INVALID_STATUS],
  [OTHER, 'INVITED', 'ACTIVE', MSG_INVITED_NOT_ACCEPTED], // A7
  [OTHER, 'INVITED', 'INACTIVE', MSG_INVITED_NOT_ACCEPTED],
]
for (const [targetId, current, next, harap] of edit) {
  cek(`edit ${targetId === ME ? 'self' : 'lain'} ${current}->${next}`, userEditStatusError({ actorId: ME, targetId, current, next }), harap)
}

// setUserStatus
cek('quick target ACTIVE', quickStatusTargetError('ACTIVE'), null)
cek('quick target INACTIVE', quickStatusTargetError('INACTIVE'), null)
cek('quick target INVITED', quickStatusTargetError('INVITED'), MSG_INVITED_QUICK)

const quick: [string, UserStatus, UserStatus, string | null][] = [
  [OTHER, 'ACTIVE', 'INACTIVE', null],
  [OTHER, 'INACTIVE', 'ACTIVE', null],
  [ME, 'ACTIVE', 'ACTIVE', null], // self-aktifkan tidak mengunci
  [ME, 'ACTIVE', 'INACTIVE', MSG_SELF_DEACTIVATE],
  [OTHER, 'INVITED', 'ACTIVE', MSG_INVITED_NOT_ACCEPTED], // A7
  [OTHER, 'INVITED', 'INACTIVE', MSG_INVITED_NOT_ACCEPTED],
  [ME, 'INVITED', 'INACTIVE', MSG_INVITED_NOT_ACCEPTED], // A7 dicek sebelum self
]
for (const [targetId, current, next, harap] of quick) {
  cek(`quick ${targetId === ME ? 'self' : 'lain'} ${current}->${next}`, quickStatusChangeError({ actorId: ME, targetId, current, next }), harap)
}

// Rule 06: admin aktif terakhir. [role, status] sekarang -> berikut, admin aktif lain, hasil
const last: [[UserRole, UserStatus], [UserRole, UserStatus], number, boolean][] = [
  [['ADMIN', 'ACTIVE'], ['ADMIN', 'INACTIVE'], 0, true],
  [['ADMIN', 'ACTIVE'], ['PROJECT_MANAGER', 'ACTIVE'], 0, true],
  [['ADMIN', 'ACTIVE'], ['ADMIN', 'INACTIVE'], 1, false],
  [['ADMIN', 'ACTIVE'], ['ADMIN', 'ACTIVE'], 0, false],
  [['ADMIN', 'INACTIVE'], ['ADMIN', 'INACTIVE'], 0, false],
  [['TEAM_MEMBER', 'ACTIVE'], ['VIEWER', 'INACTIVE'], 0, false],
]
for (const [current, next, otherActiveAdmins, harap] of last) {
  cek(
    `last-admin ${current.join('/')}->${next.join('/')} lain=${otherActiveAdmins}`,
    removesLastActiveAdmin({ current: { role: current[0], status: current[1] }, next: { role: next[0], status: next[1] }, otherActiveAdmins }),
    harap
  )
}

console.log(`LULUS: ${ok}`)
console.log(`GAGAL: ${gagal}`)
if (gagal > 0) process.exit(1)
