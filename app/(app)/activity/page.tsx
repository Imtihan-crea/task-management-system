import { Suspense } from 'react'
import { requireProfile } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
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

// meeting + meeting_action_item ditambahkan (audit C7).
const ENTITY_OPTIONS = ['', 'project', 'workstream', 'task', 'suggestion', 'user', 'meeting', 'meeting_action_item']
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
  'MEETING_CREATED',
  'MEETING_UPDATED',
  'MEETING_SCHEDULED',
  'MEETING_COMPLETED',
  'MEETING_CANCELLED',
  'MEETING_PARTICIPANT_ADDED',
  'MEETING_PARTICIPANT_REMOVED',
  'MEETING_AGENDA_UPDATED',
  'MEETING_DECISION_CREATED',
  'MEETING_ACTION_ITEM_CREATED',
  'MEETING_ACTION_ITEM_UPDATED',
  'MEETING_TASK_CREATED',
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

  // Audit B17: filter actor di query (sebelum paginasi), bukan setelahnya.
  if (actor) {
    // PostgREST juga memakai * sebagai wildcard ilike.
    const like = `%${actor.replace(/[\\%_*]/g, (c) => `\\${c}`)}%`
    const admin = createAdminClient()
    const [{ data: byName }, { data: byEmail }] = await Promise.all([
      admin.from('profiles').select('id').ilike('full_name', like).limit(200),
      admin.from('profiles').select('id').ilike('email', like).limit(200),
    ])
    const ids = [
      ...new Set([...(byName ?? []), ...(byEmail ?? [])].map((r) => (r as { id: string }).id)),
    ]
    const system = 'system'.includes(actor.toLowerCase())
    if (ids.length > 0) {
      query = system
        ? query.or(`actor_user_id.in.(${ids.join(',')}),actor_user_id.is.null`)
        : query.in('actor_user_id', ids)
    } else {
      query = system ? query.is('actor_user_id', null) : query.eq('id', '00000000-0000-0000-0000-000000000000')
    }
  }
  if (entity) query = query.eq('entity_type', entity)
  if (action) query = query.eq('action', action)
  if (project) query = query.eq('project_id', project)
  // Tanggal filter = hari kalender WIB (audit C14), bukan UTC.
  if (from) query = query.gte('created_at', `${from}T00:00:00+07:00`)
  if (to) query = query.lte('created_at', `${to}T23:59:59.999+07:00`)

  const { data, error, count } = await query
  const entries = (data ?? []) as ActivityEntry[]
  const total = count ?? 0

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
        Terjadi kesalahan. Silakan coba lagi.
      </p>
    )
  }

  return (
    <>
      <div className="mt-4 rounded-2xl bg-white p-5 shadow dark:bg-zinc-900">
        <ActivityTimeline entries={entries} actorNames={actorNames} emptyText="Activity tidak ditemukan." />
      </div>

      <div className="mt-4 flex items-center justify-between">
        <p className="text-sm text-zinc-500">
          Halaman {page} dari {totalPages} ({total} entri)
        </p>
        <div className="flex gap-2">
          {page > 1 && (
            <a href={qs(page - 1)} className="inline-flex min-h-[44px] items-center rounded-lg border px-4 py-2 text-sm font-semibold">
              Sebelumnya
            </a>
          )}
          {page < totalPages && (
            <a href={qs(page + 1)} className="inline-flex min-h-[44px] items-center rounded-lg border px-4 py-2 text-sm font-semibold">
              Berikutnya
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
          label="Entitas Activity"
          items={[
            { key: 'all', label: 'Semua' },
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
          <label htmlFor="f-entity" className="mb-1 block text-sm font-medium">Entitas</label>
          <select id="f-entity" name="entity" defaultValue={fEntity} className="min-h-[44px] rounded-lg border px-3 py-2 text-base dark:border-zinc-700 dark:bg-zinc-800">
            {ENTITY_OPTIONS.map((e) => (
              <option key={e} value={e}>{e === '' ? 'Semua' : e}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="f-action" className="mb-1 block text-sm font-medium">Aksi</label>
          <select id="f-action" name="action" defaultValue={fAction} className="min-h-[44px] rounded-lg border px-3 py-2 text-base dark:border-zinc-700 dark:bg-zinc-800">
            {ACTION_OPTIONS.map((a) => (
              <option key={a} value={a}>{a === '' ? 'Semua' : a.replace(/_/g, ' ')}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="f-actor" className="mb-1 block text-sm font-medium">Pelaku</label>
          <input
            id="f-actor"
            name="actor"
            defaultValue={fActor}
            placeholder="Nama user"
            className="min-h-[44px] rounded-lg border px-3 py-2 text-base dark:border-zinc-700 dark:bg-zinc-800"
          />
        </div>
        <div>
          <label htmlFor="f-from" className="mb-1 block text-sm font-medium">Dari</label>
          <input id="f-from" name="from" type="date" defaultValue={fFrom} className="min-h-[44px] rounded-lg border px-3 py-2 text-base dark:border-zinc-700 dark:bg-zinc-800" />
        </div>
        <div>
          <label htmlFor="f-to" className="mb-1 block text-sm font-medium">Sampai</label>
          <input id="f-to" name="to" type="date" defaultValue={fTo} className="min-h-[44px] rounded-lg border px-3 py-2 text-base dark:border-zinc-700 dark:bg-zinc-800" />
        </div>
        <button type="submit" className="min-h-[44px] rounded-lg bg-kasuat-gold px-5 py-2 font-semibold text-kasuat-black">
          Terapkan
        </button>
      </form>

      <Suspense key={resultsKey} fallback={<SkeletonRows rows={5} />}>
        <ActivityResults filters={filters} />
      </Suspense>
    </AppShell>
  )
}
