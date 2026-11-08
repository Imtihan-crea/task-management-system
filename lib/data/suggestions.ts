import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'

// Audit C18: dipindah dari app/actions/suggestions.ts ('use server') supaya
// tidak terekspos sebagai server action yang menerima userId/role bebas.
/** Project yang boleh dipilih creator (existing scope, §9). */
export async function getSuggestableProjects(
  userId: string,
  role: string
): Promise<{ id: string; code: string; name: string }[]> {
  const admin = createAdminClient()

  if (role === 'ADMIN') {
    const { data } = await admin
      .from('projects')
      .select('id, code, name')
      .order('name', { ascending: true })
      .limit(500)
    return (data ?? []) as { id: string; code: string; name: string }[]
  }

  if (role === 'PROJECT_MANAGER') {
    const { data: links } = await admin
      .from('project_managers')
      .select('project_id')
      .eq('user_id', userId)

    const ids = ((links ?? []) as { project_id: string }[]).map((l) => l.project_id)
    if (ids.length === 0) return []

    const { data } = await admin
      .from('projects')
      .select('id, code, name')
      .in('id', ids)
      .order('name', { ascending: true })
    return (data ?? []) as { id: string; code: string; name: string }[]
  }

  // TEAM_MEMBER: project yang dia terlibat (punya task aktif).
  const { data: myTasks } = await admin
    .from('tasks')
    .select('project_id')
    .eq('assignee_id', userId)
    .eq('is_deleted', false)
    .limit(1000)

  const ids = [
    ...new Set(((myTasks ?? []) as { project_id: string }[]).map((t) => t.project_id)),
  ]
  if (ids.length === 0) return []

  const { data } = await admin
    .from('projects')
    .select('id, code, name')
    .in('id', ids)
    .order('name', { ascending: true })
  return (data ?? []) as { id: string; code: string; name: string }[]
}
