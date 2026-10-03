import Link from 'next/link'
import { requireProfile } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { AppShell } from '@/components/layout/AppShell'
import { PageHeader, EmptyState } from '@/components/ui/primitives'

function sanitize(value: string | undefined): string {
  return (value ?? '').replace(/[,()*%]/g, ' ').trim().slice(0, 60)
}

export default async function WorkstreamsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const profile = await requireProfile()
  const params = await searchParams
  const qRaw = typeof params.q === 'string' ? params.q : ''
  const q = sanitize(qRaw).toLowerCase()

  const admin = createAdminClient()
  const role = profile.role

  // Scope mengikuti project scope (§18 PRD 08-09 + §34 PRD 03-04).
  let projectIds: string[] | null = null
  if (role === 'PROJECT_MANAGER') {
    const { data: links } = await admin
      .from('project_managers')
      .select('project_id')
      .eq('user_id', profile.id)
    projectIds = ((links ?? []) as { project_id: string }[]).map((l) => l.project_id)
  } else if (role === 'TEAM_MEMBER') {
    const { data: myTasks } = await admin
      .from('tasks')
      .select('project_id')
      .eq('assignee_id', profile.id)
      .eq('is_deleted', false)
      .limit(1000)
    projectIds = [
      ...new Set(((myTasks ?? []) as { project_id: string }[]).map((t) => t.project_id)),
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
    const { data: tasks } = await admin
      .from('tasks')
      .select('workstream_id')
      .in('workstream_id', wsIds)
      .eq('is_deleted', false)
      .limit(2000)
    for (const t of (tasks ?? []) as { workstream_id: string | null }[]) {
      if (t.workstream_id) taskCounts[t.workstream_id] = (taskCounts[t.workstream_id] ?? 0) + 1
    }
  }

  return (
    <AppShell>
      <PageHeader
        title="Workstreams"
        subtitle={`${workstreams.length} workstream${workstreams.length === 1 ? '' : 's'}`}
      />

      <form method="get" className="mt-4 flex flex-col gap-3 rounded-2xl bg-white p-4 shadow sm:flex-row sm:items-end dark:bg-zinc-900">
        <div className="flex-1">
          <label htmlFor="q" className="mb-1 block text-sm font-medium">Search</label>
          <input
            id="q"
            name="q"
            type="search"
            defaultValue={qRaw}
            placeholder="Nama workstream"
            className="min-h-[44px] w-full rounded-lg border px-3 py-2 text-base dark:border-zinc-700 dark:bg-zinc-800"
          />
        </div>
        <button type="submit" className="min-h-[44px] rounded-lg bg-kasuat-gold px-5 py-2 font-semibold text-kasuat-black">
          Apply
        </button>
      </form>

      {workstreams.length === 0 ? (
        <div className="mt-4">
          <EmptyState title="No workstreams found." message="Workstreams are managed inside each project." />
        </div>
      ) : (
        <>
          <div className="mt-4 hidden overflow-x-auto rounded-2xl bg-white shadow md:block dark:bg-zinc-900">
            <table className="w-full text-left text-sm">
              <thead className="border-b text-xs uppercase text-zinc-500">
                <tr>
                  <th scope="col" className="px-4 py-3">Code</th>
                  <th scope="col" className="px-4 py-3">Name</th>
                  <th scope="col" className="px-4 py-3">Project</th>
                  <th scope="col" className="px-4 py-3">Tasks</th>
                </tr>
              </thead>
              <tbody>
                {workstreams.map((w) => (
                  <tr key={w.id} className="border-b last:border-0">
                    <td className="px-4 py-3 font-mono text-xs">{w.code}</td>
                    <td className="px-4 py-3">
                      <Link href={`/projects/${w.project_id}`} className="font-medium hover:underline">
                        {w.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3">{projectNames[w.project_id] ?? '-'}</td>
                    <td className="px-4 py-3">{taskCounts[w.id] ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="mt-4 flex flex-col gap-3 md:hidden">
            {workstreams.map((w) => (
              <li key={w.id}>
                <Link
                  href={`/projects/${w.project_id}`}
                  className="block rounded-2xl bg-white p-4 shadow dark:bg-zinc-900"
                >
                  <p className="font-semibold">
                    <span className="mr-2 rounded-md bg-zinc-100 px-1.5 py-0.5 font-mono text-xs dark:bg-zinc-800">
                      {w.code}
                    </span>
                    {w.name}
                  </p>
                  <p className="mt-0.5 truncate text-sm text-zinc-500">
                    {projectNames[w.project_id] ?? '-'} &middot; {taskCounts[w.id] ?? 0} tasks
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </AppShell>
  )
}
