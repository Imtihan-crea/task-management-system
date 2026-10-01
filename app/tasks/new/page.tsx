import Link from 'next/link'
import { requireManager } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { AppShell } from '@/components/layout/AppShell'
import { TaskForm } from '@/components/tasks/TaskForm'
import { getActiveUsers } from '@/lib/data/users'

export default async function NewTaskPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>
}) {
  await requireManager()

  const params = await searchParams
  const presetProject = typeof params.project === 'string' ? params.project : ''

  const admin = createAdminClient()
  const [{ data: projects }, { data: workstreams }, users] = await Promise.all([
    admin.from('projects').select('id, name').order('name', { ascending: true }).limit(500),
    admin.from('workstreams').select('id, project_id, name').order('name', { ascending: true }).limit(1000),
    getActiveUsers(),
  ])

  return (
    <AppShell>
      <Link href="/tasks" className="text-sm font-medium text-zinc-500 hover:underline">
        &larr; Back to Tasks
      </Link>
      <h1 className="mt-2 text-2xl font-bold">Create Task</h1>

      <div className="mt-4 rounded-2xl bg-white p-5 shadow dark:bg-zinc-900">
        <TaskForm
          mode="create"
          projects={(projects ?? []) as { id: string; name: string }[]}
          workstreams={(workstreams ?? []) as { id: string; project_id: string; name: string }[]}
          users={users}
          initial={{ project_id: presetProject }}
        />
      </div>
    </AppShell>
  )
}
