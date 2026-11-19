import type { UserRole } from '@/types/profile'

/**
 * Permission Matrix (PRD Phase 2 section 7)
 *
 * Prinsip: "Role menentukan capability."
 * Capability "Later" sengaja TIDAK dibuat permission di sini,
 * supaya tidakterneira ada tapi belum ada fiturnya.
 */
export type Permission =
  | 'users.view'
  | 'users.invite'
  | 'users.edit'
  | 'users.changeRole'
  | 'users.activate'
  | 'users.deactivate'
  // Hanya Super Admin / Developer (lib/auth/access.ts), tidak ada di paket peran.
  | 'permissions.manage'
  | 'profile.viewOwn'
  | 'profile.editOwn'
  | 'projects.view'
  | 'projects.create'
  | 'projects.edit'
  | 'workstreams.create'
  | 'workstreams.edit'
  | 'workstreams.delete'
  | 'tasks.view'
  | 'tasks.create'
  | 'tasks.edit'
  | 'tasks.changeStatusOwn'
  | 'tasks.submitEvidenceOwn'
  | 'tasks.cancel'
  | 'tasks.delete'
  | 'suggestions.create'
  | 'suggestions.review'
  // --- Phase 11: Meeting (§37) ---
  | 'meetings.view'
  | 'meetings.create'
  | 'meetings.edit'
  | 'meetings.complete'
  | 'meetings.cancel'
  | 'meetings.manageParticipants'
  // --- HR Tahap 1 (16 Nov 2026): Daily Tracker ---
  // Bawaan peran mengikuti COA (ROLE_PERMISSIONS); akun lain lewat tab Wewenang.
  | 'hr.view'
  | 'hr.manage'
  // Lihat & komentari tracker anggota project (PM View).
  | 'tracker.review'
  // Kelola Master Reference (tambah, ubah, arsip, kukuhkan usulan teks bebas).
  | 'reference.manage'
  // Setujui / tolak cuti, izin, sakit (Tahap 2). hr.manage juga boleh.
  | 'leave.approve'
  // Client Management (pipeline lead, migrasi 025): lihat dan kelola.
  // clients.manage otomatis boleh melihat.
  | 'clients.view'
  | 'clients.manage'

/**
 * Paket peran mengikuti bagan wewenang Kasuat (COA, 19 Nov 2026).
 * Label tampil: ADMIN = Admin, PROJECT_MANAGER = Project Manager,
 * TEAM_MEMBER = Project Officer, VIEWER = Guest (lib/auth/roles.ts).
 * Super Admin / Developer selalu punya semua izin (lib/auth/access.ts).
 * Izin ber-scope project dari peran: Admin semua project, PM project yang ia
 * kelola, Project Officer dan Guest project tempat ia punya task.
 */
const BASE: Permission[] = ['profile.viewOwn', 'profile.editOwn', 'projects.view', 'tasks.view', 'meetings.view']
const OWN_WORK: Permission[] = ['tasks.changeStatusOwn', 'tasks.submitEvidenceOwn', 'suggestions.create', 'meetings.create']
const MEETING_MANAGE: Permission[] = ['meetings.edit', 'meetings.complete', 'meetings.cancel', 'meetings.manageParticipants']
const STAFF: Permission[] = [
  ...BASE,
  ...OWN_WORK,
  ...MEETING_MANAGE,
  'hr.view',
  'tracker.review',
  'clients.view',
  'tasks.create',
  'tasks.edit',
]
const PM_EXTRA: Permission[] = [
  'workstreams.create',
  'workstreams.edit',
  'workstreams.delete',
  'tasks.cancel',
  'tasks.delete',
  'suggestions.review',
]

// Pengguna luar (sekarang hanya Guest): lihat miliknya + usul task di project tempat ia
// punya task (keputusan pemilik 19 Nov 2026), tanpa mengubah apa pun lainnya. Peran luar
// berikutnya (mis. klien brand / investor) bisa memakai dasar yang sama.
const OUTSIDER: Permission[] = [...BASE, 'suggestions.create']

// shortcut: dokumen COA memberi Guest kelola meeting dan lihat Client Management; ditahan
// karena Guest = klien/pihak luar (bisa melihat klien lain beserta kontaknya). Menunggu
// konfirmasi pemilik; untuk menyalakan isi dengan [...MEETING_MANAGE, 'clients.view'].
const GUEST_HELD: Permission[] = []

const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  ADMIN: [
    ...STAFF,
    ...PM_EXTRA,
    'users.view',
    'users.invite',
    'users.edit',
    'users.changeRole',
    'users.activate',
    'users.deactivate',
    'projects.create',
    'projects.edit',
    'hr.manage',
    'reference.manage',
    'leave.approve',
    'clients.manage',
  ],
  PROJECT_MANAGER: [...STAFF, ...PM_EXTRA],
  TEAM_MEMBER: STAFF,
  VIEWER: [...OUTSIDER, ...GUEST_HELD],
}

export function can(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false
}

export function isAdmin(role: UserRole): boolean {
  return role === 'ADMIN'
}

/**
 * Meeting (Phase 11, §37; diperbarui COA 19 Nov 2026):
 * - meetings.edit ber-scope project: Admin semua, PM project kelolaan,
 *   Project Officer project tempat ia punya task. Organizer meeting tetap
 *   boleh mengelola meeting miliknya (lib/meetings/rules.ts), kecuali Guest.
 * - Guest tidak membuat atau mengelola meeting (lihat GUEST_HELD); Guest hanya boleh
 *   membuat usulan task (suggestions.create), dibatasi server ke project tempat ia punya task.
 * - Action Item -> Task memakai `tasks.create` (PRD §51 Rule 5).
 */
