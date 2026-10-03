import { createAdminClient } from '@/lib/supabase/admin'
import { formatDate } from '@/lib/utils/dates'
import { ProjectStatusBadge } from '@/components/ui/Badges'
import type { Project, ProjectProgress } from '@/types/project'

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 border-b py-2.5 last:border-0 sm:flex-row sm:justify-between sm:gap-4">
      <dt className="text-sm text-zinc-500">{label}</dt>
      <dd className="text-sm font-medium break-all">{value}</dd>
    </div>
  )
}

export async function OverviewTab({ projectId }: { projectId: string }) {
  const admin = createAdminClient()

  const [{ data: project }, { data: tasks }, { data: pmLinks }] = await Promise.all([
    admin.from('projects').select('*').eq('id', projectId).single<Project>(),
    admin
      .from('tasks')
      .select('status, deadline, assignee_id')
      .eq('project_id', projectId)
      .eq('is_deleted', false)
      .limit(1000),
    admin.from('project_managers').select('user_id').eq('project_id', projectId),
  ])

  if (!project) return <p className="text-sm text-zinc-500">Project not found.</p>

  const taskList = (tasks ?? []) as { status: string; deadline: string; assignee_id: string }[]
  const progress: ProjectProgress = {
    total: taskList.length,
    completed: taskList.filter((t) => t.status === 'DONE').length,
    inProgress: taskList.filter((t) => t.status === 'IN_PROGRESS').length,
    blocked: taskList.filter((t) => t.status === 'BLOCKED').length,
    todo: taskList.filter((t) => t.status === 'TODO' || t.status === 'REVIEW').length,
    percent: 0,
  }
  progress.percent =
    progress.total === 0 ? 0 : Math.round((progress.completed / progress.total) * 100)

  const pmIds = ((pmLinks ?? []) as { user_id: string }[]).map((l) => l.user_id)
  let pmDisplay = '-'
  if (pmIds.length > 0) {
    const { data: pmProfiles } = await admin
      .from('profiles')
      .select('full_name, email')
      .in('id', pmIds)
    pmDisplay =
      ((pmProfiles ?? []) as { full_name: string | null; email: string }[])
        .map((u) => u.full_name || u.email)
        .join(', ') || '-'
  }

  const today = new Date().toISOString().slice(0, 10)
  const upcoming = taskList.filter((t) => t.status !== 'DONE' && t.deadline >= today).length

  return (
    <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
      <section className="rounded-2xl bg-white p-5 shadow dark:bg-zinc-900">
        <h2 className="mb-2 text-lg font-bold">Project Detail</h2>
        <dl>
          <Row label="Project ID" value={project.code} />
          <Row label="Client" value={project.client || '-'} />
          <Row label="Description" value={project.description || '-'} />
          <Row label="Start Date" value={formatDate(project.start_date)} />
          <Row label="Deadline" value={formatDate(project.end_date)} />
          <Row label="Status" value={project.status.replace('_', ' ')} />
          <Row label="Project Managers" value={pmDisplay} />
        </dl>
      </section>

      <section className="rounded-2xl bg-white p-5 shadow dark:bg-zinc-900">
        <h2 className="mb-2 text-lg font-bold">Project Progress</h2>
        <div className="flex items-center gap-3">
          <span className="rounded-md bg-zinc-100 px-2 py-1 font-mono text-sm dark:bg-zinc-800">
            {project.code}
          </span>
          <ProjectStatusBadge status={project.status} />
        </div>
        <div
          className="mt-3 h-3 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700"
          role="progressbar"
          aria-valuenow={progress.percent}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div className="h-full rounded-full bg-kasuat-gold" style={{ width: `${progress.percent}%` }} />
        </div>
        <dl className="mt-3">
          <Row label="Total Task" value={String(progress.total)} />
          <Row label="Completed" value={String(progress.completed)} />
          <Row label="In Progress" value={String(progress.inProgress)} />
          <Row label="Blocked" value={String(progress.blocked)} />
          <Row label="Todo" value={String(progress.todo)} />
          <Row label="Progress" value={`${progress.percent}%`} />
          <Row label="Upcoming Deadlines" value={String(upcoming)} />
        </dl>
      </section>
    </div>
  )
}
