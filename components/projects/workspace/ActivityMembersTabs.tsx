import { createAdminClient } from '@/lib/supabase/admin'
import {
  ActivityTimeline,
  resolveActorNames,
  type ActivityEntry,
} from '@/components/activity/ActivityTimeline'

export async function ActivityTab({ projectId }: { projectId: string }) {
  const admin = createAdminClient()

  const { data: activityData } = await admin
    .from('activity_logs')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(50)
  const projectActivity = (activityData ?? []) as ActivityEntry[]
  const activityActors = await resolveActorNames(projectActivity)

  return (
    <section className="rounded-2xl bg-white p-5 shadow dark:bg-zinc-900">
      <h2 className="mb-3 text-lg font-bold">Project Activity</h2>
      <ActivityTimeline entries={projectActivity} actorNames={activityActors} />
    </section>
  )
}

export async function MembersTab({ projectId }: { projectId: string }) {
  const admin = createAdminClient()

  const [{ data: pmLinks }, { data: tasks }] = await Promise.all([
    admin.from('project_managers').select('user_id').eq('project_id', projectId),
    admin
      .from('tasks')
      .select('assignee_id')
      .eq('project_id', projectId)
      .eq('is_deleted', false)
      .limit(1000),
  ])

  const pmIds = ((pmLinks ?? []) as { user_id: string }[]).map((l) => l.user_id)
  const memberIds = [
    ...new Set([
      ...pmIds,
      ...((tasks ?? []) as { assignee_id: string }[]).map((t) => t.assignee_id),
    ]),
  ]

  let members: { id: string; full_name: string | null; email: string; role: string }[] = []
  if (memberIds.length > 0) {
    const { data } = await admin
      .from('profiles')
      .select('id, full_name, email, role')
      .in('id', memberIds)
      .order('full_name', { ascending: true })
    members = (data ?? []) as typeof members
  }

  return (
    <section className="rounded-2xl bg-white p-5 shadow dark:bg-zinc-900">
      <h2 className="mb-3 text-lg font-bold">Members ({members.length})</h2>
      {members.length === 0 ? (
        <p className="text-sm text-zinc-500">No members yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {members.map((m) => (
            <li
              key={m.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3 dark:border-zinc-700"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{m.full_name || m.email}</p>
                <p className="truncate text-xs text-zinc-500">{m.email}</p>
              </div>
              <div className="flex items-center gap-2">
                {pmIds.includes(m.id) && (
                  <span className="rounded-full bg-kasuat-gold px-2 py-0.5 text-xs font-semibold text-kasuat-black">
                    PM
                  </span>
                )}
                <span className="text-xs text-zinc-500">{m.role.replace('_', ' ')}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
