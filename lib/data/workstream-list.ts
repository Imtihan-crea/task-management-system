import 'server-only'

import { managedProjects } from '@/lib/auth/current-access'
import { createAdminClient } from '@/lib/supabase/admin'
import { allRows } from '@/lib/utils/paginate'
import type { UserRole } from '@/types/profile'
import { seesOwnProjectsOnly } from '@/lib/auth/roles'

export function sanitizeWorkstreamSearch(value: string | undefined): string {
  return (value ?? '').replace(/[,()*%]/g, ' ').trim().slice(0, 60)
}

/**
 * Daftar workstream untuk halaman /workstreams dan export Excel: cakupan project
 * mengikuti peran + izin per akun. `q` sudah disanitasi dan huruf kecil.
 */
export async function loadWorkstreams(profile: { id: string; role: UserRole }, q: string) {
  const admin = createAdminClient()
  const role = profile.role

  // Scope mengikuti project scope (§18 PRD 08-09 + §34 PRD 03-04).
  let projectIds: string[] | null = null
  const granted = role !== 'ADMIN' ? await managedProjects(profile.id) : null
  if (granted?.all) {
    projectIds = null
  } else if (role === 'PROJECT_MANAGER') {
    // Project kelolaan + yang diberi lewat aturan per akun.
    projectIds = granted!.ids
  } else if (seesOwnProjectsOnly(role)) {
    const { data: myTasks } = await admin
      .from('tasks')
      .select('project_id')
      .eq('assignee_id', profile.id)
      .eq('is_deleted', false)
      .limit(1000)
    projectIds = [
      ...new Set([...((myTasks ?? []) as { project_id: string }[]).map((t) => t.project_id), ...granted!.ids]),
    ]
  }

  let wsQuery = admin
    .from('workstreams')
    .select('id, project_id, code, name, description, created_at')
    .order('created_at', { ascending: false })
    .limit(500)
  if (projectIds !== null) {
    wsQuery =
      projectIds.length > 0
        ? wsQuery.in('project_id', projectIds)
        : wsQuery.eq('project_id', '00000000-0000-0000-0000-000000000000')
  }
  if (q) wsQuery = wsQuery.ilike('name', `%${q}%`)

  const [{ data: wsData }, { data: projData }] = await Promise.all([
    wsQuery,
    admin.from('projects').select('id, code, name').limit(500),
  ])

  const workstreams = (wsData ?? []) as {
    id: string
    project_id: string
    code: string
    name: string
    description: string | null
    created_at: string
  }[]
  const projectNames = Object.fromEntries(
    ((projData ?? []) as { id: string; code: string; name: string }[]).map((p) => [
      p.id,
      `${p.code} · ${p.name}`,
    ])
  )

  // Task count per workstream (satu query agregat ringan).
  const wsIds = workstreams.map((w) => w.id)
  const taskCounts: Record<string, number> = {}
  if (wsIds.length > 0) {
    const tasks = await allRows<{ workstream_id: string | null }>((from, to) =>
      admin
        .from('tasks')
        .select('workstream_id')
        .in('workstream_id', wsIds)
        .eq('is_deleted', false)
        .order('id')
        .range(from, to)
    )
    for (const t of tasks) {
      if (t.workstream_id) taskCounts[t.workstream_id] = (taskCounts[t.workstream_id] ?? 0) + 1
    }
  }

  return { workstreams, projectNames, taskCounts }
}
