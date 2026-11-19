import Link from 'next/link'
import { notFound } from 'next/navigation'
import { hasPermission, requirePermission } from '@/lib/auth/current-access'
import { createAdminClient } from '@/lib/supabase/admin'
import { AppShell } from '@/components/layout/AppShell'
import { CreateWorkstreamForm } from '@/components/projects/WorkstreamForms'

export default async function NewWorkstreamPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>
}) {
  const profile = await requirePermission('workstreams.create')
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

  // Hanya di project tempat ia boleh membuat workstream.
  if (!(await hasPermission(profile.id, 'workstreams.create', project.id))) {
    notFound()
  }

  return (
    <AppShell>
      <Link
        href={`/projects/${project.id}?tab=workstreams`}
        className="inline-flex min-h-[44px] items-center text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:underline"
      >
        &larr; Kembali ke {project.code} · {project.name}
      </Link>
      <h1 className="mt-2 text-xl font-bold">Buat Workstream</h1>
      <p className="mt-0.5 text-sm text-zinc-600 dark:text-zinc-400">
        Project: {project.code} · {project.name}
      </p>

      <div className="mt-4">
        <CreateWorkstreamForm projectId={project.id} />
      </div>
    </AppShell>
  )
}
