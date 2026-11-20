import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Pemutus untuk task di sebuah project (review PM, alih task): PM project itu;
 * project tanpa PM -> semua Admin aktif supaya tidak tertahan tanpa pemberitahuan.
 */
export async function projectDeciders(projectId: string): Promise<string[]> {
  const admin = createAdminClient()
  const { data: pms } = await admin.from('project_managers').select('user_id').eq('project_id', projectId)
  const ids = ((pms ?? []) as { user_id: string }[]).map((p) => p.user_id)
  if (ids.length > 0) return ids
  const { data } = await admin.from('profiles').select('id').eq('role', 'ADMIN').eq('status', 'ACTIVE').is('deleted_at', null)
  return ((data ?? []) as { id: string }[]).map((p) => p.id)
}
