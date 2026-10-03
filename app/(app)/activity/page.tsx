import { Suspense } from 'react'
import { requireProfile } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'
import { AppShell } from '@/components/layout/AppShell'
import { Tabs } from '@/components/ui/Tabs'
import { SkeletonRows } from '@/components/ui/Skeleton'
import {
  ActivityTimeline,
  resolveActorNames,
  type ActivityEntry,
} from '@/components/activity/ActivityTimeline'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 25

const ENTITY_OPTIONS = ['', 'project', 'workstream', 'task', 'suggestion', 'user']
const ACTION_OPTIONS = [
  '',
  'TASK_CREATED',
  'TASK_UPDATED',
  'TASK_ASSIGNED',
  'TASK_STATUS_CHANGED',
  'TASK_PRIORITY_CHANGED',
  'TASK_DEADLINE_CHANGED',
  'TASK_EVIDENCE_UPDATED',
  'TASK_DELETED',
  'PROJECT_CREATED',
  'PROJECT_UPDATED',
  'PROJECT_PM_ADDED',
  'PROJECT_PM_REMOVED',
  'WORKSTREAM_CREATED',
  'WORKSTREAM_UPDATED',
  'WORKSTREAM_DELETED',
  'SUGGESTION_CREATED',
  'SUGGESTION_UPDATED',
  'SUGGESTION_APPROVED',
  'SUGGESTION_REVISION_REQUESTED',
  'SUGGESTION_REJECTED',
  'SUGGESTION_CONVERTED',
  'USER_CREATED',
  'USER_UPDATED',
  'USER_ACTIVATED',
  'USER_DEACTIVATED',
  'ROLE_CHANGED',
]

function str(v: string | string[] | undefined): string {
  return typeof v === 'string' ? v : ''
}

export type ActivityFilters = {
  entity: string
  action: string
  actor: string
  from: string
  to: string
  project: string
  page: number
}

/**
 * Hasil activity: fetch sendiri supaya Suspense boundary benar-benar
 * memisahkan loading timeline dari header/filter (§12, §13).
 * Query pakai USER client supaya RLS scope otomatis berlaku (§18, §19).
 */
async function ActivityResults({ filters }: { filters: ActivityFilters }) {
  const { entity, action, actor, from, to, project, page } = filters
  const offset = (page - 1) * PAGE_SIZE

  const supabase = await createClient()
  let query = supabase
    .from('activity_logs')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1)

  if (entity) query = query.eq('entity_type', entity)
  if (action) query = query.eq('action', action)
  if (project) query = query.eq('project_id', project)
  if (from) query = query.gte('created_at', `${from}T00:00:00`)
  if (to) query = query.lte('created_at', `${to}T23:59:59`)

  const { data, error, count } = await query
  let entries = (data ?? []) as ActivityEntry[]
  const total = count ?? 0

  if (actor) {
    const needle = actor.toLowerCase()
    const names = await resolveActorNames(entries)
    entries = entries.filter((e) => {
      if (!e.actor_user_id) return 'system'.includes(needle)
      return (names[e.actor_user_id] ?? '').toLowerCase().includes(needle)
    })
  }

  const actorNames = await resolveActorNames(entries)
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const qs = (p: number) => {
    const params = new URLSearchParams()
    if (entity) params.set('entity', entity)
    if (action) params.set('action', action)
    if (actor) params.set('actor', actor)
    if (from) params.set('from', from)
    if (to) params.set('to', to)
    if (project) params.set('project', project)
    params.set('page', String(p))
    return `/activity?${params.toString()}`
  }

  if (error) {
    return (
      <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm font-medium text-red-700 dark:bg-red-950 dark:text-red-300">
        Something went wrong. Please try again.
      </p>
    )
  }

  return (
    <>
      <div className="mt-4 rounded-2xl bg-white p-5 shadow dark:bg-zinc-900">
        <ActivityTimeline entries={entries} actorNames={actorNames} emptyText="No activity found." />
      </div>

      <div className="mt-4 flex items-center justify-between">
        <p className="text-sm text-zinc-500">
          Page {page} of {totalPages} ({total} entries)
        </p>
        <div className="flex gap-2">
          {page > 1 && (
            <a href={qs(page - 1)} className="inline-flex min-h-[44px] items-center rounded-lg border px-4 py-2 text-sm font-semibold">
              Prev
            </a>
          )}
          {page < totalPages && (
            <a href={qs(page + 1)} className="inline-flex min-h-[44px] items-center rounded-lg border px-4 py-2 text-sm font-semibold">
              Next
            </a>
          )}
        </div>
      </div>
    </>
  )
}

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireProfile()
  const params = await searchParams

  const fEntity = str(params.entity)
  const fAction = str(params.action)
  const fActor = str(params.actor ?? '').trim().slice(0, 60)
  const fFrom = str(params.from)
  const fTo = str(params.to)
  const fProject = str(params.project)
  const page = Math.max(1, parseInt(str(params.page) || '1', 10) || 1)

  const filters: ActivityFilters = {
    entity: fEntity,
    action: fAction,
    actor: fActor,
    from: fFrom,
    to: fTo,
    project: fProject,
    page,
  }
  const resultsKey = JSON.stringify(filters)

  return (
    <AppShell>
      <h1 className="text-2xl font-bold">Activity Log</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Riwayat aktivitas penting di seluruh sistem.
      </p>

      <div className="mt-4">
        <Tabs
          label="Activity entity"
          items={[
            { key: 'all', label: 'All' },
            { key: 'task', label: 'Tasks' },
            { key: 'project', label: 'Projects' },
            { key: 'workstream', label: 'Workstreams' },
            { key: 'suggestion', label: 'Suggestions' },
            { key: 'user', label: 'Users' },
          ].map((t) => {
            const p = new URLSearchParams()
            if (fAction) p.set('action', fAction)
            if (fActor) p.set('actor', fActor)
            if (fFrom) p.set('from', fFrom)
            if (fTo) p.set('to', fTo)
            if (fProject) p.set('project', fProject)
            if (t.key !== 'all') p.set('entity', t.key)
            const s = p.toString()
            return {
              ...t,
              href: s ? `/activity?${s}` : '/activity',
              active: (fEntity || 'all') === t.key,
            }
          })}
        />
      </div>

      <form
        method="get"
        className="mt-4 flex flex-col gap-3 rounded-2xl bg-white p-4 shadow sm:flex-row sm:flex-wrap sm:items-end dark:bg-zinc-900"
      >
        {fEntity && <input type="hidden" name="entity" value={fEntity} />}
        <div>
          <label htmlFor="f-entity" className="mb-1 block text-sm font-medium">Entity</label>
          <select id="f-entity" name="entity" defaultValue={fEntity} className="min-h-[44px] rounded-lg border px-3 py-2 text-base dark:border-zinc-700 dark:bg-zinc-800">
            {ENTITY_OPTIONS.map((e) => (
              <option key={e} value={e}>{e === '' ? 'All' : e}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="f-action" className="mb-1 block text-sm font-medium">Action</label>
          <select id="f-action" name="action" defaultValue={fAction} className="min-h-[44px] rounded-lg border px-3 py-2 text-base dark:border-zinc-700 dark:bg-zinc-800">
            {ACTION_OPTIONS.map((a) => (
              <option key={a} value={a}>{a === '' ? 'All' : a.replace(/_/g, ' ')}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="f-actor" className="mb-1 block text-sm font-medium">Actor</label>
          <input
            id="f-actor"
            name="actor"
            defaultValue={fActor}
            placeholder="Nama user"
            className="min-h-[44px] rounded-lg border px-3 py-2 text-base dark:border-zinc-700 dark:bg-zinc-800"
          />
        </div>
        <div>
          <label htmlFor="f-from" className="mb-1 block text-sm font-medium">From</label>
          <input id="f-from" name="from" type="date" defaultValue={fFrom} className="min-h-[44px] rounded-lg border px-3 py-2 text-base dark:border-zinc-700 dark:bg-zinc-800" />
        </div>
        <div>
          <label htmlFor="f-to" className="mb-1 block text-sm font-medium">To</label>
          <input id="f-to" name="to" type="date" defaultValue={fTo} className="min-h-[44px] rounded-lg border px-3 py-2 text-base dark:border-zinc-700 dark:bg-zinc-800" />
        </div>
        <button type="submit" className="min-h-[44px] rounded-lg bg-kasuat-gold px-5 py-2 font-semibold text-kasuat-black">
          Apply
        </button>
      </form>

      <Suspense key={resultsKey} fallback={<SkeletonRows rows={5} />}>
        <ActivityResults filters={filters} />
      </Suspense>
    </AppShell>
  )
}
