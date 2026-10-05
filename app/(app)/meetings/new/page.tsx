import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { requireProfile } from '@/lib/auth/session'
import { can } from '@/lib/auth/permissions'
import { createAdminClient } from '@/lib/supabase/admin'
import { getActiveUsers } from '@/lib/data/users'
import { assertCanCreateInProject } from '@/app/actions/meetings'
import { AppShell } from '@/components/layout/AppShell'
import { MeetingForm } from '@/components/meetings/MeetingForm'

/**
 * Create meeting (§10 global, §11 dari project via ?project=).
 *
 * Kalau ?project= diisi: project diverifikasi + dikunci (read-only).
 * Pola yang sama seperti /workstreams/new?project=.
 */
export default async function NewMeetingPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>
}) {
  const profile = await requireProfile()

  if (!can(profile.role, 'meetings.create')) {
    redirect('/dashboard?denied=1')
  }

  const params = await searchParams
  const projectParam = typeof params.project === 'string' ? params.project : ''

  const admin = createAdminClient()

  // Project terkunci (kalau ada).
  let lockedProject: { id: string; code: string; name: string } | null = null
  if (projectParam) {
    const { data } = await admin
      .from('projects')
      .select('id, code, name')
      .eq('id', projectParam)
      .maybeSingle<{ id: string; code: string; name: string }>()
    if (!data) notFound()

    const scopeError = await assertCanCreateInProject(data.id, profile.id, profile.role)
    if (scopeError) notFound()
    lockedProject = data
  }

  // Dropdown project sesuai scope (pola getSuggestableProjects).
  let projects: { id: string; code: string; name: string }[] = []
  if (!lockedProject) {
    if (profile.role === 'ADMIN') {
      const { data } = await admin
        .from('projects')
        .select('id, code, name')
        .order('name', { ascending: true })
        .limit(500)
      projects = (data ?? []) as { id: string; code: string; name: string }[]
    } else if (profile.role === 'PROJECT_MANAGER') {
      const { data: links } = await admin
        .from('project_managers')
        .select('project_id')
        .eq('user_id', profile.id)
      const ids = ((links ?? []) as { project_id: string }[]).map((l) => l.project_id)
      if (ids.length > 0) {
        const { data } = await admin
          .from('projects')
          .select('id, code, name')
          .in('id', ids)
          .order('name', { ascending: true })
        projects = (data ?? []) as { id: string; code: string; name: string }[]
      }
    } else {
      // TEAM_MEMBER: project yang ia ikuti (punya task aktif).
      const { data: myTasks } = await admin
        .from('tasks')
        .select('project_id')
        .eq('assignee_id', profile.id)
        .eq('is_deleted', false)
        .limit(1000)
      const ids = [
        ...new Set(((myTasks ?? []) as { project_id: string }[]).map((t) => t.project_id)),
      ]
      if (ids.length > 0) {
        const { data } = await admin
          .from('projects')
          .select('id, code, name')
          .in('id', ids)
          .order('name', { ascending: true })
        projects = (data ?? []) as { id: string; code: string; name: string }[]
      }
    }
  }

  const users = await getActiveUsers()

  return (
    <AppShell>
      <Link
        href={lockedProject ? `/projects/${lockedProject.id}?tab=meetings` : '/meetings'}
        className="text-sm font-medium text-zinc-500 hover:underline"
      >
        &larr; Back to {lockedProject ? `${lockedProject.code} · ${lockedProject.name}` : 'Meetings'}
      </Link>
      <h1 className="mt-2 text-xl font-bold">Create Meeting</h1>
      {lockedProject && (
        <p className="mt-0.5 text-sm text-zinc-500">
          Project otomatis terkunci: {lockedProject.code} · {lockedProject.name}
        </p>
      )}

      <div className="mt-4 rounded-2xl bg-white p-4 shadow dark:bg-zinc-900">
        <MeetingForm
          projects={projects}
          users={users}
          selfId={profile.id}
          canPickOrganizer={profile.role === 'ADMIN' || profile.role === 'PROJECT_MANAGER'}
          lockedProject={lockedProject}
        />
      </div>
    </AppShell>
  )
}