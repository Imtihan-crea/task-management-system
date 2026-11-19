import Link from 'next/link'
import { requirePermission } from '@/lib/auth/current-access'
import { AppShell } from '@/components/layout/AppShell'
import { ProjectForm } from '@/components/projects/ProjectForm'
import { getActiveUsers } from '@/lib/data/users'

export default async function NewProjectPage({ searchParams }: { searchParams: Promise<{ client?: string | string[] }> }) {
  await requirePermission('projects.create')
  const managers = await getActiveUsers(['ADMIN', 'PROJECT_MANAGER'])
  // Dari Client Management (lead Deal): nama klien terisi di kolom Client.
  const { client } = await searchParams
  const initialClient = typeof client === 'string' ? client.slice(0, 150) : ''

  return (
    <AppShell>
      <Link href="/projects" className="inline-flex min-h-[44px] items-center text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:underline">
        &larr; Kembali ke Projects
      </Link>
      <h1 className="mt-2 text-xl font-bold">Buat Project</h1>

      <div className="mt-4 rounded-2xl bg-white p-4 shadow-sm dark:bg-zinc-900">
        <ProjectForm mode="create" managers={managers} initial={{ client: initialClient }} />
      </div>
    </AppShell>
  )
}
