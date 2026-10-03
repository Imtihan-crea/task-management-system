import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  DeleteWorkstreamForm,
  EditWorkstreamForm,
} from '@/components/projects/WorkstreamForms'
import type { WorkstreamListItem } from '@/types/workstream'

export async function WorkstreamsTab({
  projectId,
  canManage,
}: {
  projectId: string
  canManage: boolean
}) {
  const admin = createAdminClient()

  const [{ data: workstreams }, { data: tasks }] = await Promise.all([
    admin
      .from('workstreams')
      .select('id, project_id, code, name, description, created_at')
      .eq('project_id', projectId)
      .order('created_at', { ascending: true }),
    admin
      .from('tasks')
      .select('id, workstream_id')
      .eq('project_id', projectId)
      .eq('is_deleted', false)
      .limit(1000),
  ])

  const wsList = (workstreams ?? []) as WorkstreamListItem[]
  const taskList = (tasks ?? []) as { id: string; workstream_id: string | null }[]

  return (
    <section className="rounded-2xl bg-white p-5 shadow dark:bg-zinc-900">
      <h2 className="text-lg font-bold">Workstreams ({wsList.length})</h2>
      {wsList.length === 0 ? (
        <p className="mt-2 text-sm text-zinc-500">No workstreams yet.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-3">
          {wsList.map((ws) => {
            const count = taskList.filter((t) => t.workstream_id === ws.id).length
            return (
              <li key={ws.id} className="rounded-xl border p-3 dark:border-zinc-700">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold">
                      <span className="mr-2 rounded-md bg-zinc-100 px-1.5 py-0.5 font-mono text-xs dark:bg-zinc-800">
                        {ws.code}
                      </span>
                      {ws.name}{' '}
                      <span className="text-xs font-normal text-zinc-500">
                        ({count} task{count === 1 ? '' : 's'})
                      </span>
                    </p>
                    {ws.description && (
                      <p className="text-sm text-zinc-500">{ws.description}</p>
                    )}
                  </div>
                  {canManage && (
                    <div className="w-40">
                      <DeleteWorkstreamForm id={ws.id} />
                    </div>
                  )}
                </div>
                {canManage && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-sm font-medium text-zinc-500">
                      Edit
                    </summary>
                    <div className="mt-2">
                      <EditWorkstreamForm
                        id={ws.id}
                        name={ws.name}
                        description={ws.description}
                      />
                    </div>
                  </details>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {canManage && (
        <div className="mt-4">
          <Link
            href={`/workstreams/new?project=${projectId}`}
            className="inline-flex min-h-[44px] items-center rounded-lg bg-kasuat-gold px-4 py-2 text-sm font-semibold text-kasuat-black"
          >
            + Add Workstream
          </Link>
        </div>
      )}
    </section>
  )
}
