import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireManager } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { isProjectManager } from '@/lib/data/projects'
import { AppShell } from '@/components/layout/AppShell'
import { CreateWorkstreamForm } from '@/components/projects/WorkstreamForms'

export default async function NewWorkstreamPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>
}) {
  const profile = await requireManager()
  const params = await searchParams
  const projectId = typeof params.project === 'string' ? params.project : ''

  const admin = createAdminClient()

  let project = null
  if (projectId) {
    const { data } = await admin
      .from('projects')
      .select('id, code, name')
      .eq('id', projectId)
      .single<{ id: string; code: string; name: string }>()
    project = data
  }

  if (!project) notFound()

  // PM hanya boleh buat workstream di project miliknya.
  if (
    profile.role === 'PROJECT_MANAGER' &&
    !(await isProjectManager(project.id, profile.id))
  ) {
    notFound()
  }

  return (
    <AppShell>
      <Link
        href={`/projects/${project.id}?tab=workstreams`}
        className="text-sm font-medium text-zinc-500 hover:underline"
      >
        &larr; Back to {project.code} · {project.name}
      </Link>
      <h1 className="mt-2 text-xl font-bold">Create Workstream</h1>
      <p className="mt-0.5 text-sm text-zinc-500">
        Project: {project.code} · {project.name}
      </p>

      <div className="mt-4">
        <CreateWorkstreamForm projectId={project.id} />
      </div>
    </AppShell>
  )
}
