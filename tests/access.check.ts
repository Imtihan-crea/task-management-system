/**
 * Uji lib/auth/access.ts — wewenang efektif per akun.
 * Jalankan: npm run test:access
 */
import { applyProjectScope, decide, isGrantable, projectScope, PERMISSION_SCOPE, type AccessContext } from '../lib/auth/access'
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

const ROLES: UserRole[] = ['ADMIN', 'PROJECT_MANAGER', 'TEAM_MEMBER', 'VIEWER']
const ctx = (role: UserRole, o: Partial<AccessContext> = {}): AccessContext => ({
  // P1 = project yang ia kelola (PM), P2 = project tempat ia punya task, P3 = project lain.
  userId: 'u', role, isSuperAdmin: false, isDeveloper: false, overrides: [], managedProjectIds: ['P1'], memberProjectIds: ['P2'], ...o,
})
const perms = Object.keys(PERMISSION_SCOPE) as Permission[]

// 1. Tanpa aturan per akun = paket peran COA. Izin per project: Admin semua project,
//    PM project kelolaan, Project Officer / Guest project tempat ia punya task.
const ROLE_PROJECTS: Record<UserRole, string[]> = {
  ADMIN: ['P1', 'P2', 'P3'],
  PROJECT_MANAGER: ['P1'],
  TEAM_MEMBER: ['P2'],
  VIEWER: ['P2'],
}
for (const role of ROLES) {
  for (const p of perms) {
    if (p === 'permissions.manage') continue
    if (PERMISSION_SCOPE[p] === 'project') {
      for (const pid of ['P1', 'P2', 'P3']) {
        cek(`${role} ${p} di ${pid}`, decide(ctx(role), p, pid), can(role, p) && ROLE_PROJECTS[role].includes(pid))
      }
    } else {
      cek(`${role} ${p}`, decide(ctx(role), p), can(role, p))
    }
  }
  cek(`${role} tidak bisa kelola wewenang`, decide(ctx(role), 'permissions.manage'), false)
}
// Contoh konkret per peran (mudah dibaca saat review).
cek('PO ubah task di project tempat ia punya task', decide(ctx('TEAM_MEMBER'), 'tasks.edit', 'P2'), true)
cek('PO ubah task di project lain', decide(ctx('TEAM_MEMBER'), 'tasks.edit', 'P3'), false)
cek('PO tidak boleh batalkan / hapus task', [decide(ctx('TEAM_MEMBER'), 'tasks.cancel', 'P2'), decide(ctx('TEAM_MEMBER'), 'tasks.delete', 'P2')], [false, false])
cek('PM tidak lagi buat / ubah project', [decide(ctx('PROJECT_MANAGER'), 'projects.create'), decide(ctx('PROJECT_MANAGER'), 'projects.edit', 'P1')], [false, false])
cek('PM dan PO lihat rekap HR + Client Management', [decide(ctx('PROJECT_MANAGER'), 'hr.view'), decide(ctx('TEAM_MEMBER'), 'clients.view')], [true, true])
cek('Guest tanpa izin kelola apa pun', perms.filter((p) => PERMISSION_SCOPE[p] !== 'role' && decide(ctx('VIEWER'), p, 'P2')), [])
cek('Guest hanya boleh usul task (selain lihat)', perms.filter((p) => PERMISSION_SCOPE[p] === 'role' && decide(ctx('VIEWER'), p) && !/\.view|viewOwn|editOwn/.test(p)), ['suggestions.create'])

// 1b. Override per akun menang atas bawaan peran: beri dan cabut untuk setiap izin global.
for (const role of ROLES) {
  for (const p of perms.filter((x) => PERMISSION_SCOPE[x] === 'global' && isGrantable(x))) {
    cek(`${role} ${p} diberi`, decide(ctx(role, { overrides: [{ permission: p, projectId: null, granted: true }] }), p), true)
    cek(`${role} ${p} dicabut`, decide(ctx(role, { overrides: [{ permission: p, projectId: null, granted: false }] }), p), false)
  }
}
const poCut = ctx('TEAM_MEMBER', { overrides: [{ permission: 'tasks.edit', projectId: 'P2', granted: false }] })
cek('PO dicabut ubah task di P2', decide(poCut, 'tasks.edit', 'P2'), false)

// 2. Super Admin / Developer.
cek('super semua', decide(ctx('ADMIN', { isSuperAdmin: true }), 'permissions.manage'), true)
cek('developer semua', decide(ctx('ADMIN', { isDeveloper: true }), 'tasks.delete', 'P9'), true)
cek('super tidak bisa dicabut', decide(ctx('ADMIN', { isSuperAdmin: true, overrides: [{ permission: 'tasks.edit', projectId: null, granted: false }] }), 'tasks.edit', 'P1'), true)

// 3. Beri / cabut.
const guestEdit = ctx('VIEWER', { overrides: [{ permission: 'tasks.edit', projectId: 'P2', granted: true }] })
cek('Guest diberi edit di P2', decide(guestEdit, 'tasks.edit', 'P2'), true)
cek('Guest diberi P2, bukan P3', decide(guestEdit, 'tasks.edit', 'P3'), false)
cek('Guest tombol edit muncul', decide(guestEdit, 'tasks.edit'), true)
cek('scope Guest', projectScope(guestEdit, 'tasks.edit'), { all: false, include: ['P2'], exclude: [] })

const guestAll = ctx('VIEWER', { overrides: [{ permission: 'tasks.create', projectId: null, granted: true }, { permission: 'tasks.create', projectId: 'P3', granted: false }] })
cek('Guest semua project', decide(guestAll, 'tasks.create', 'P8'), true)
cek('Guest semua kecuali P3', decide(guestAll, 'tasks.create', 'P3'), false)

const pmCut = ctx('PROJECT_MANAGER', { overrides: [{ permission: 'tasks.delete', projectId: null, granted: false }] })
cek('PM dicabut hapus di semua project', decide(pmCut, 'tasks.delete', 'P1'), false)
const pmCutOne = ctx('PROJECT_MANAGER', { overrides: [{ permission: 'tasks.delete', projectId: 'P1', granted: false }] })
cek('PM dicabut hapus di P1 saja', [decide(pmCutOne, 'tasks.delete', 'P1'), decide(pmCutOne, 'tasks.delete')], [false, false])
const adminCutOne = ctx('ADMIN', { overrides: [{ permission: 'tasks.delete', projectId: 'P1', granted: false }] })
cek('Admin dicabut di P1, P2 tetap', [decide(adminCutOne, 'tasks.delete', 'P1'), decide(adminCutOne, 'tasks.delete', 'P2')], [false, true])

const pmUsers = ctx('PROJECT_MANAGER', { overrides: [{ permission: 'users.view', projectId: null, granted: true }] })
cek('PM diberi lihat user (global)', decide(pmUsers, 'users.view'), true)
const adminNoInvite = ctx('ADMIN', { overrides: [{ permission: 'users.invite', projectId: null, granted: false }] })
cek('Admin dicabut undang user', decide(adminNoInvite, 'users.invite'), false)

// 4. Izin terkunci / ikut peran tidak bisa diberikan.
cek('permissions.manage terkunci', isGrantable('permissions.manage'), false)
cek('tasks.view ikut peran', isGrantable('tasks.view'), false)
cek('tasks.edit bisa diberi', isGrantable('tasks.edit'), true)
cek('locked tetap false walau ada baris', decide(ctx('TEAM_MEMBER', { overrides: [{ permission: 'permissions.manage', projectId: null, granted: true }] }), 'permissions.manage'), false)

// 5. applyProjectScope (filter query): catat panggilan builder palsu.
type Call = [string, string, unknown, unknown?]
const fakeQuery = () => {
  const calls: Call[] = []
  const q = {
    calls,
    in(c: string, v: string[]) { calls.push(['in', c, v]); return q },
    not(c: string, op: string, v: string) { calls.push(['not', c, op, v]); return q },
  }
  return q
}
cek('scope semua = tanpa filter', applyProjectScope(fakeQuery(), { all: true, include: [], exclude: [] }).calls, [])
cek('scope semua kecuali', applyProjectScope(fakeQuery(), { all: true, include: [], exclude: ['P3'] }).calls, [['not', 'id', 'in', '(P3)']])
cek('scope include', applyProjectScope(fakeQuery(), { all: false, include: ['P1', 'P2'], exclude: [] }, 'project_id').calls, [['in', 'project_id', ['P1', 'P2']]])
cek('scope kosong = tidak ada hasil', applyProjectScope(fakeQuery(), { all: false, include: [], exclude: [] }).calls, [['in', 'id', ['00000000-0000-0000-0000-000000000000']]])

cek('Super Admin hr.manage', decide(ctx('ADMIN', { isSuperAdmin: true }), 'hr.manage'), true)
cek('PO tracker.review di project tempat ia punya task', [decide(ctx('TEAM_MEMBER'), 'tracker.review', 'P2'), decide(ctx('TEAM_MEMBER'), 'tracker.review', 'P1')], [true, false])
cek('PM tracker.review dicabut di P1', decide(ctx('PROJECT_MANAGER', { overrides: [{ permission: 'tracker.review', projectId: 'P1', granted: false }] }), 'tracker.review', 'P1'), false)
cek('Developer reference.manage', decide(ctx('ADMIN', { isDeveloper: true }), 'reference.manage'), true)

console.log(`LULUS: ${ok}`)
console.log(`GAGAL: ${gagal}`)
if (gagal > 0) process.exit(1)
