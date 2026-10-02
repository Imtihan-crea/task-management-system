import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'

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
