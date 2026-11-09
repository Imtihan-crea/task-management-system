/**
 * Uji lib/auth/task-access.ts — siapa boleh ubah status/submit/cancel/evidence task.
 * Jalankan: npm run test:task-access
 */
import { canActOnTask, canCancelTask } from '../lib/auth/task-access'
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

// [role, isAssignee, managesProject, boleh?]
const kasus: [UserRole, boolean, boolean, boolean][] = [
  ['ADMIN', false, false, true],
  ['ADMIN', true, true, true],
  ['PROJECT_MANAGER', false, true, true],
  ['PROJECT_MANAGER', false, false, false],
  ['PROJECT_MANAGER', true, false, true], // assignee di project PM lain (A4)
  ['TEAM_MEMBER', true, false, true],
  ['TEAM_MEMBER', false, false, false],
  ['TEAM_MEMBER', false, true, false], // managesProject tidak berlaku untuk TM
  ['VIEWER', true, true, false],
  ['VIEWER', false, false, false],
]
for (const [role, isAssignee, managesProject, harap] of kasus) {
  cek(`${role} assignee=${isAssignee} pm=${managesProject}`, canActOnTask(role, { isAssignee, managesProject }), harap)
}

// C20: Cancel hanya ADMIN atau PM pengelola project. [role, managesProject, boleh?]
const cancelKasus: [UserRole, boolean, boolean][] = [
  ['ADMIN', false, true],
  ['PROJECT_MANAGER', true, true],
  ['PROJECT_MANAGER', false, false], // PM yang hanya assignee di project PM lain
  ['TEAM_MEMBER', false, false],
  ['TEAM_MEMBER', true, false],
  ['VIEWER', true, false],
]
for (const [role, managesProject, harap] of cancelKasus) {
  cek(`cancel ${role} pm=${managesProject}`, canCancelTask(role, { managesProject }), harap)
}

console.log(`LULUS: ${ok}`)
console.log(`GAGAL: ${gagal}`)
if (gagal > 0) process.exit(1)
