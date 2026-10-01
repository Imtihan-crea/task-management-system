import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import type { UserRole } from '@/types/profile'
import type { UserOption } from '@/lib/data/user-options'

/**
 * Daftar user ACTIVE untuk dropdown assignee / project manager.
 * Hanya dipanggil dari Server Component yang sudah dicek requireManager().
 */
export async function getActiveUsers(roles?: UserRole[]): Promise<UserOption[]> {
  const admin = createAdminClient()

  let query = admin
    .from('profiles')
    .select('id, full_name, email, role')
    .eq('status', 'ACTIVE')
    .order('full_name', { ascending: true })
    .limit(500)

  if (roles && roles.length > 0) {
    query = query.in('role', roles)
  }

  const { data } = await query
  return (data ?? []) as UserOption[]
}
