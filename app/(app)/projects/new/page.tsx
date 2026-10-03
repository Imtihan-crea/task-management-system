import Link from 'next/link'
import { requireManager } from '@/lib/auth/session'
import { AppShell } from '@/components/layout/AppShell'
import { ProjectForm } from '@/components/projects/ProjectForm'
import { getActiveUsers } from '@/lib/data/users'

export default async function NewProjectPage() {
  await requireManager()
  const managers = await getActiveUsers(['ADMIN', 'PROJECT_MANAGER'])

  return (
    <AppShell>
      <Link href="/projects" className="text-sm font-medium text-zinc-500 hover:underline">
        &larr; Back to Projects
      </Link>
      <h1 className="mt-2 text-xl font-bold">Create Project</h1>

      <div className="mt-4 rounded-2xl bg-white p-4 shadow dark:bg-zinc-900">
        <ProjectForm mode="create" managers={managers} />
      </div>
    </AppShell>
  )
}
