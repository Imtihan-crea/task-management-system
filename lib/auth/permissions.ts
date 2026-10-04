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

const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  ADMIN: [
    'users.view',
    'users.invite',
    'users.edit',
    'users.changeRole',
    'users.activate',
    'users.deactivate',
    'profile.viewOwn',
    'profile.editOwn',
    'projects.view',
    'projects.create',
    'projects.edit',
    'workstreams.create',
    'workstreams.edit',
    'workstreams.delete',
    'tasks.view',
    'tasks.create',
    'tasks.edit',
    'tasks.changeStatusOwn',
    'tasks.submitEvidenceOwn',
    'tasks.delete',
    'suggestions.create',
    'suggestions.review',
    'meetings.view',
    'meetings.create',
    'meetings.edit',
    'meetings.complete',
    'meetings.cancel',
    'meetings.manageParticipants',
  ],
  PROJECT_MANAGER: [
    'profile.viewOwn',
    'profile.editOwn',
    'projects.view',
    'projects.create',
    'projects.edit',
    'workstreams.create',
    'workstreams.edit',
    'workstreams.delete',
    'tasks.view',
    'tasks.create',
    'tasks.edit',
    'tasks.changeStatusOwn',
    'tasks.submitEvidenceOwn',
    'tasks.delete',
    'suggestions.create',
    'suggestions.review',
    'meetings.view',
    'meetings.create',
    'meetings.edit',
    'meetings.complete',
    'meetings.cancel',
    'meetings.manageParticipants',
  ],
  TEAM_MEMBER: [
    'profile.viewOwn',
    'profile.editOwn',
    'projects.view',
    'tasks.view',
    'tasks.changeStatusOwn',
    'tasks.submitEvidenceOwn',
    'suggestions.create',
    'meetings.view',
    'meetings.create',
  ],
  VIEWER: ['profile.viewOwn', 'profile.editOwn', 'projects.view', 'tasks.view', 'meetings.view'],
}

export function can(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false
}

export function isAdmin(role: UserRole): boolean {
  return role === 'ADMIN'
}

/**
 * Matrix Phase 11 (§37) — ringkasan supaya mudah dibaca saat review.
 *
 * | Capability                    | ADMIN | PM  | TEAM | VIEWER |
 * |-------------------------------|:-----:|:---:|:----:|:------:|
 * | Lihat meeting yang accessible |   ✓   |  ✓  |  ✓   |   ✓    |
 * | Buat meeting                  |   ✓   |  ✓  |  ✓   |   ✗    |
 * | Edit meeting                   |   ✓   |  ✓  | ✗*   |   ✗    |
 * | Complete meeting               |   ✓   |  ✓  | ✗*   |   ✗    |
 * | Cancel meeting                 |   ✓   |  ✓  | ✗*   |   ✗    |
 * | Kelola participants           |   ✓   |  ✓  | ✗*   |   ✗    |
 * | Action Item → Task             |   ✓   |  ✓  |  ✓   |   ✗    |
 *
 * Catatan:
 * - PRD §37 menulis "configurable" untuk Viewer create meeting. Keputusan owner:
 *   TIDAK bisa. Permission di sini dijawab eksplisit, bukan dibiarkan implisit.
 * - Tanda ✗* berarti capability-nya UEBIH ada untuk role itu TAPI hanya bila
 *   user adalah organizer meeting (atau PM project terkait). Cek runtime
 *   dilakukan di server, bukan hanya dari permission — lihat
 *   assertCanManageMeeting() di app/actions/meetings.ts.
 * - Action Item → Task memakai permission `tasks.create` yang sudah ada
 *   (PRD §51 Rule 5: tidak boleh membuat sistem Task kedua).
 */
