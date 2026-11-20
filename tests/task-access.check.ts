/**
 * Uji lib/auth/task-access.ts — siapa boleh ubah status/submit/cancel/evidence task.
 * Jalankan: npm run test:task-access
 */
import { canActOnTask, canCancelTask, canPickStatus, submitTarget } from '../lib/auth/task-access'
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


// Review PM (20 Nov 2026): submit consultant -> REVIEW, pengelola -> DONE.
cek('submit pengelola = DONE', submitTarget(true), 'DONE')
cek('submit consultant = REVIEW', submitTarget(false), 'REVIEW')

// Dropdown status. [managesProject, from, to, boleh?]
const pilihKasus: [boolean, string, string, boolean][] = [
  [false, 'TODO', 'IN_PROGRESS', true],
  [false, 'IN_PROGRESS', 'BLOCKED', true],
  [false, 'IN_PROGRESS', 'REVIEW', false], // REVIEW hanya lewat Submit
  [true, 'IN_PROGRESS', 'REVIEW', false],
  [false, 'REVIEW', 'IN_PROGRESS', false], // consultant tidak bisa keluar dari REVIEW
  [false, 'REVIEW', 'TODO', false],
  [true, 'REVIEW', 'IN_PROGRESS', true], // PM boleh membuka kembali
  [true, 'REVIEW', 'REVIEW', true],
  [false, 'REVIEW', 'REVIEW', true], // tidak berubah
  [true, 'TODO', 'DONE', false],
  [true, 'TODO', 'CANCELLED', false],
]
for (const [pm, from, to, harap] of pilihKasus) {
  cek(`pilih ${from}->${to} pm=${pm}`, canPickStatus(pm, from, to), harap)
}

console.log(`LULUS: ${ok}`)
console.log(`GAGAL: ${gagal}`)
if (gagal > 0) process.exit(1)
