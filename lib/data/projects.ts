import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { canManageProject } from '@/lib/auth/project-access'

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
 * canManageProject + query PM hanya bila role-nya PM (ADMIN tanpa query).
 * Dipakai server action untuk cek kelola project/task/workstream/suggestion.
 */
export async function canManageProjectFor(
  profile: { id: string; role: string },
  projectId: string
): Promise<boolean> {
  return canManageProject(
    profile.role,
    profile.role === 'PROJECT_MANAGER' && (await isProjectManager(projectId, profile.id))
  )
}

/** Nama semua PM sebuah project (untuk tampilan). */
export async function getProjectManagerNames(
  projectId: string
): Promise<string[]> {
  const ids = await getProjectManagerIds(projectId)
  if (ids.length === 0) return []

  const { data } = await createAdminClient()
    .from('profiles')
    .select('id, full_name, email')
    .in('id', ids)

  return ((data ?? []) as { id: string; full_name: string | null; email: string }[]).map(
    (u) => u.full_name || u.email
  )
}
