import Link from 'next/link'
import { applyProjectScope, permissionProjects, requirePermission } from '@/lib/auth/current-access'
import { createAdminClient } from '@/lib/supabase/admin'
import { AppShell } from '@/components/layout/AppShell'
import { TaskForm } from '@/components/tasks/TaskForm'
import { getActiveUsers } from '@/lib/data/users'

export default async function NewTaskPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>
}) {
  const profile = await requirePermission('tasks.create')

  const params = await searchParams
  const presetProject = typeof params.project === 'string' ? params.project : ''

  const admin = createAdminClient()

  // Dropdown project: hanya project tempat ia boleh membuat task.
  const projectsQuery = applyProjectScope(
    admin.from('projects').select('id, code, name').order('name', { ascending: true }).limit(500),
    await permissionProjects(profile.id, 'tasks.create')
  )

  const [{ data: projects }, { data: workstreams }, users] = await Promise.all([
    projectsQuery,
    admin.from('workstreams').select('id, project_id, code, name').order('name', { ascending: true }).limit(1000),
    getActiveUsers(),
  ])

  return (
    <AppShell>
      <Link href="/tasks" className="text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:underline">
        &larr; Kembali ke Tasks
      </Link>
      <h1 className="mt-2 text-2xl font-bold">Buat Task</h1>

      <div className="mt-4 rounded-2xl bg-white p-5 shadow dark:bg-zinc-900">
        <TaskForm
          mode="create"
          projects={(projects ?? []) as { id: string; code: string; name: string }[]}
          workstreams={(workstreams ?? []) as { id: string; project_id: string; code: string; name: string }[]}
          users={users}
          initial={{ project_id: presetProject }}
        />
      </div>
    </AppShell>
  )
}
