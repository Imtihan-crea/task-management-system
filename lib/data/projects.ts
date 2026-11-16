import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { hasPermission } from '@/lib/auth/current-access'
import type { Permission } from '@/lib/auth/permissions'

/**
 * Satu-satunya sumber kebenaran untuk "siapa PM project ini":
 * tabel relasi project_managers (migration 004).
 */
export async function getProjectManagerIds(projectId: string): Promise<string[]> {
  const { data } = await createAdminClient()
    .from('project_managers')
    .select('user_id')
    .eq('project_id', projectId)

  return ((data ?? []) as { user_id: string }[]).map((row) => row.user_id)
}

export async function isProjectManager(
  projectId: string,
  userId: string
): Promise<boolean> {
  const { data } = await createAdminClient()
    .from('project_managers')
    .select('user_id')
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .maybeSingle<{ user_id: string }>()

  return Boolean(data)
}

/**
 * Boleh `permission` di project ini? Peran + aturan per akun (lib/auth/access.ts).
 * Dipakai server action untuk cek kelola project/task/workstream/suggestion.
 */
export async function canManageProjectFor(
  profile: { id: string },
  projectId: string,
  permission: Permission
): Promise<boolean> {
  return hasPermission(profile.id, permission, projectId)
}

/**
 * Project COMPLETED/CANCELLED tertutup untuk task/suggestion baru
 * (audit B14 [keputusan default]). Project yang tidak ada dianggap tertutup.
 */
export const CLOSED_PROJECT_ERROR =
  'Project ini COMPLETED atau CANCELLED. Buka kembali untuk menambah task baru.'

export async function isProjectClosed(projectId: string): Promise<boolean> {
  const { data } = await createAdminClient()
    .from('projects')
    .select('status')
    .eq('id', projectId)
    .maybeSingle<{ status: string }>()
  return !data || data.status === 'COMPLETED' || data.status === 'CANCELLED'
}
