import 'server-only'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export type ActivityFilters = {
  entity: string
  action: string
  actor: string
  from: string
  to: string
  project: string
  page: number
}

/** Param URL /activity -> filter (tanpa halaman). Satu sumber untuk halaman dan export Excel. */
export function parseActivityFilters(get: (key: string) => string): Omit<ActivityFilters, 'page'> {
  return {
    entity: get('entity'),
    action: get('action'),
    actor: get('actor').trim().slice(0, 60),
    from: get('from'),
    to: get('to'),
    project: get('project'),
  }
}

/**
 * Query activity_logs dengan USER client supaya RLS scope otomatis berlaku (§18, §19).
 * Mengembalikan fungsi per rentang baris (bukan builder: builder itu thenable dan akan
 * langsung jalan bila di-await dari async function).
 */
export async function activityPager(filters: Omit<ActivityFilters, 'page'>) {
  const { entity, action, actor, from, to, project } = filters

  const supabase = await createClient()
  let query = supabase
    .from('activity_logs')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .order('id')

  // Audit B17: filter actor di query (sebelum paginasi), bukan setelahnya.
  if (actor) {
    // PostgREST juga memakai * sebagai wildcard ilike.
    const like = `%${actor.replace(/[\\%_*]/g, (c) => `\\${c}`)}%`
    const admin = createAdminClient()
    const [{ data: byName }, { data: byEmail }] = await Promise.all([
      admin.from('profiles').select('id').ilike('full_name', like).limit(200),
      admin.from('profiles').select('id').ilike('email', like).limit(200),
    ])
    const ids = [
      ...new Set([...(byName ?? []), ...(byEmail ?? [])].map((r) => (r as { id: string }).id)),
    ]
    const system = 'system'.includes(actor.toLowerCase())
    if (ids.length > 0) {
      query = system
        ? query.or(`actor_user_id.in.(${ids.join(',')}),actor_user_id.is.null`)
        : query.in('actor_user_id', ids)
    } else {
      query = system ? query.is('actor_user_id', null) : query.eq('id', '00000000-0000-0000-0000-000000000000')
    }
  }
  if (entity) query = query.eq('entity_type', entity)
  if (action) query = query.eq('action', action)
  if (project) query = query.eq('project_id', project)
  // Tanggal filter = hari kalender WIB (audit C14), bukan UTC.
  if (from) query = query.gte('created_at', `${from}T00:00:00+07:00`)
  if (to) query = query.lte('created_at', `${to}T23:59:59.999+07:00`)
  return (from: number, to: number) => query.range(from, to)
}
