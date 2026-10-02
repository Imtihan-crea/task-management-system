import Link from 'next/link'
import { requireProfile } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { can } from '@/lib/auth/permissions'
import { AppShell } from '@/components/layout/AppShell'
import { SuggestionForm } from '@/components/suggestions/SuggestionForms'
import { getSuggestableProjects } from '@/app/actions/suggestions'
import { getActiveUsers } from '@/lib/data/users'

export default async function NewSuggestionPage() {
  const profile = await requireProfile()

  if (!can(profile.role, 'suggestions.create')) {
    return (
      <AppShell>
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm font-medium text-red-700 dark:bg-red-950 dark:text-red-300">
          You do not have permission to perform this action.
        </p>
      </AppShell>
    )
  }

  const admin = createAdminClient()
  const [projects, users] = await Promise.all([
    getSuggestableProjects(profile.id, profile.role),
    getActiveUsers(),
  ])
  const [{ data: workstreams }] = await Promise.all([
    admin.from('workstreams').select('id, project_id, code, name').order('name', { ascending: true }).limit(1000),
  ])

  return (
    <AppShell>
      <Link href="/task-suggestions" className="text-sm font-medium text-zinc-500 hover:underline">
        &larr; Back to Suggestions
      </Link>
      <h1 className="mt-2 text-2xl font-bold">Suggest Task</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Usulan dibaca oleh PM/Admin sebelum menjadi official task.
      </p>

      {projects.length === 0 ? (
        <p className="mt-4 rounded-2xl bg-white p-8 text-center text-sm text-zinc-500 shadow dark:bg-zinc-900">
          No projects available. You can only suggest tasks for projects you are involved in.
        </p>
      ) : (
        <div className="mt-4 rounded-2xl bg-white p-5 shadow dark:bg-zinc-900">
          <SuggestionForm
            projects={projects}
            workstreams={(workstreams ?? []) as { id: string; project_id: string; code: string; name: string }[]}
            users={users}
          />
        </div>
      )}
    </AppShell>
  )
}
