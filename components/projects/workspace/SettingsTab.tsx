import { createAdminClient } from '@/lib/supabase/admin'
import { ProjectForm } from '@/components/projects/ProjectForm'
import { getActiveUsers } from '@/lib/data/users'

export async function SettingsTab({ projectId }: { projectId: string }) {
  const admin = createAdminClient()

  const [{ data: project }, { data: pmLinks }, managers] = await Promise.all([
    admin.from('projects').select('*').eq('id', projectId).single(),
    admin.from('project_managers').select('user_id').eq('project_id', projectId),
    getActiveUsers(['ADMIN', 'PROJECT_MANAGER']),
  ])

  if (!project) return <p className="text-sm text-zinc-500">Project not found.</p>

  const p = project as {
    id: string
    name: string
    client: string | null
    description: string | null
    start_date: string | null
    end_date: string | null
    status: 'PLANNING' | 'ACTIVE' | 'ON_HOLD' | 'COMPLETED' | 'CANCELLED'
  }
  const pmIds = ((pmLinks ?? []) as { user_id: string }[]).map((l) => l.user_id)

  return (
    <section>
      <ProjectForm
        mode="edit"
        managers={managers}
        initial={{
          id: p.id,
          name: p.name,
          client: p.client,
          description: p.description,
          project_manager_ids: pmIds,
          start_date: p.start_date,
          end_date: p.end_date,
          status: p.status,
        }}
      />
    </section>
  )
}
