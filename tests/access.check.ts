/**
 * Uji lib/auth/access.ts — wewenang efektif per akun.
 * Jalankan: npm run test:access
 */
import { applyProjectScope, decide, isGrantable, projectScope, PERMISSION_SCOPE, type AccessContext } from '../lib/auth/access'
import { can, type Permission } from '../lib/auth/permissions'
import { canManageProject } from '../lib/auth/project-access'
import { canCancelTask } from '../lib/auth/task-access'
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
  userId: 'u', role, isSuperAdmin: false, isDeveloper: false, overrides: [], managedProjectIds: ['P1'], ...o,
})
const perms = Object.keys(PERMISSION_SCOPE) as Permission[]

// 1. Tanpa aturan per akun = perilaku lama.
for (const role of ROLES) {
  for (const p of perms) {
    if (p === 'permissions.manage') continue
    const scope = PERMISSION_SCOPE[p]
    if (scope === 'project') {
      cek(`${role} ${p} di project kelolaan`, decide(ctx(role), p, 'P1'), can(role, p) && canManageProject(role, true))
      cek(`${role} ${p} di project lain`, decide(ctx(role), p, 'P2'), can(role, p) && canManageProject(role, false))
    } else {
      cek(`${role} ${p}`, decide(ctx(role), p), can(role, p))
    }
  }
  cek(`${role} cancel = aturan lama (kelola)`, decide(ctx(role), 'tasks.cancel', 'P1'), canCancelTask(role, { managesProject: true }))
  cek(`${role} cancel = aturan lama (lain)`, decide(ctx(role), 'tasks.cancel', 'P2'), canCancelTask(role, { managesProject: false }))
  cek(`${role} tidak bisa kelola wewenang`, decide(ctx(role), 'permissions.manage'), false)
}

// 2. Super Admin / Developer.
cek('super semua', decide(ctx('ADMIN', { isSuperAdmin: true }), 'permissions.manage'), true)
cek('developer semua', decide(ctx('ADMIN', { isDeveloper: true }), 'tasks.delete', 'P9'), true)
cek('super tidak bisa dicabut', decide(ctx('ADMIN', { isSuperAdmin: true, overrides: [{ permission: 'tasks.edit', projectId: null, granted: false }] }), 'tasks.edit', 'P1'), true)

// 3. Beri / cabut.
const tmEdit = ctx('TEAM_MEMBER', { overrides: [{ permission: 'tasks.edit', projectId: 'P2', granted: true }] })
cek('TM diberi edit di P2', decide(tmEdit, 'tasks.edit', 'P2'), true)
cek('TM diberi P2, bukan P3', decide(tmEdit, 'tasks.edit', 'P3'), false)
cek('TM tombol edit muncul', decide(tmEdit, 'tasks.edit'), true)
cek('scope TM', projectScope(tmEdit, 'tasks.edit'), { all: false, include: ['P2'], exclude: [] })

const tmAll = ctx('TEAM_MEMBER', { overrides: [{ permission: 'tasks.create', projectId: null, granted: true }, { permission: 'tasks.create', projectId: 'P3', granted: false }] })
cek('TM semua project', decide(tmAll, 'tasks.create', 'P8'), true)
cek('TM semua kecuali P3', decide(tmAll, 'tasks.create', 'P3'), false)

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

// HR Tahap 1 (16 Nov 2026): izin baru, satu-satunya penjaga karena tulis lewat service role.
const HR_ONLY: Permission[] = ['hr.view', 'hr.manage', 'reference.manage', 'leave.approve']
for (const role of ROLES) {
  for (const p of HR_ONLY) {
    cek(`${role} ${p} tanpa aturan = tidak`, decide(ctx(role), p), false)
    cek(`${role} ${p} diberi = ya`, decide(ctx(role, { overrides: [{ permission: p, projectId: null, granted: true }] }), p), true)
    cek(`${role} ${p} dapat dari peran? tidak`, can(role, p), false)
  }
  cek(`${role} ${'hr.*'} bisa diberikan lewat Wewenang`, HR_ONLY.every(isGrantable), true)
}
cek('ADMIN tracker.review semua project', [decide(ctx('ADMIN'), 'tracker.review', 'P1'), decide(ctx('ADMIN'), 'tracker.review', 'P2')], [true, true])
cek('PM tracker.review hanya project kelolaan', [decide(ctx('PROJECT_MANAGER'), 'tracker.review', 'P1'), decide(ctx('PROJECT_MANAGER'), 'tracker.review', 'P2')], [true, false])
cek('TEAM tracker.review tanpa aturan', decide(ctx('TEAM_MEMBER'), 'tracker.review', 'P1'), false)
cek('TEAM tracker.review diberi di P2 saja', [
  decide(ctx('TEAM_MEMBER', { overrides: [{ permission: 'tracker.review', projectId: 'P2', granted: true }] }), 'tracker.review', 'P2'),
  decide(ctx('TEAM_MEMBER', { overrides: [{ permission: 'tracker.review', projectId: 'P2', granted: true }] }), 'tracker.review', 'P1'),
], [true, false])
cek('PM tracker.review dicabut di P1', decide(ctx('PROJECT_MANAGER', { overrides: [{ permission: 'tracker.review', projectId: 'P1', granted: false }] }), 'tracker.review', 'P1'), false)
cek('Super Admin hr.manage', decide(ctx('ADMIN', { isSuperAdmin: true }), 'hr.manage'), true)
cek('Developer reference.manage', decide(ctx('ADMIN', { isDeveloper: true }), 'reference.manage'), true)

console.log(`LULUS: ${ok}`)
console.log(`GAGAL: ${gagal}`)
if (gagal > 0) process.exit(1)
