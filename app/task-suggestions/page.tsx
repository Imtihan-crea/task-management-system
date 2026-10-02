import Link from 'next/link'
import { requireProfile } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { can } from '@/lib/auth/permissions'
import { SUGGESTION_STATUSES, SUGGESTION_STATUS_LABELS } from '@/lib/auth/roles'
import { AppShell } from '@/components/layout/AppShell'
import { formatDate } from '@/lib/utils/dates'
import { Pagination, paginate, parsePage } from '@/components/ui/Pagination'
import type { SuggestionListItem, SuggestionStatus } from '@/types/suggestion'

function sanitize(value: string | undefined): string {
  return (value ?? '').replace(/[,()*%]/g, ' ').trim().slice(0, 60)
}

const STATUS_STYLE: Record<SuggestionStatus, string> = {
  PENDING: 'border-amber-400 text-amber-600 dark:text-amber-300',
  APPROVED: 'border-blue-400 text-blue-600 dark:text-blue-300',
  REVISION_REQUESTED: 'border-orange-400 text-orange-600 dark:text-orange-300',
  REJECTED: 'border-red-400 text-red-600 dark:text-red-300',
  CONVERTED: 'border-green-500 text-green-600 dark:text-green-300',
}

export default async function SuggestionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const profile = await requireProfile()
  const canCreate = can(profile.role, 'suggestions.create')
  const isAdmin = profile.role === 'ADMIN'
  const isPM = profile.role === 'PROJECT_MANAGER'

  const params = await searchParams
  const str = (v: string | string[] | undefined) => (typeof v === 'string' ? v : '')
  const q = sanitize(str(params.q)).toLowerCase()
  const fStatus = str(params.status)
  const view = str(params.view) // 'mine' untuk suggestion milikku

  const admin = createAdminClient()

  // Scope baca: creator lihat miliknya; PM lihat di project miliknya; admin semua.
  let scopedIds: string[] | null = null // null = semua
  if (!isAdmin) {
    if (isPM && view !== 'mine') {
      const { data: links } = await admin
        .from('project_managers')
        .select('project_id')
        .eq('user_id', profile.id)
      const myProjectIds = ((links ?? []) as { project_id: string }[]).map((l) => l.project_id)

      const { data: own } = await admin
        .from('task_suggestions')
        .select('id')
        .eq('suggested_by', profile.id)
        .limit(500)
      const ownIds = ((own ?? []) as { id: string }[]).map((o) => o.id)

      const { data: inScope } = myProjectIds.length
        ? await admin.from('task_suggestions').select('id').in('project_id', myProjectIds).limit(500)
        : { data: [] }
      scopedIds = [
        ...new Set([
          ...ownIds,
          ...((inScope ?? []) as { id: string }[]).map((s) => s.id),
        ]),
      ]
    } else {
      // TEAM_MEMBER atau view=mine: hanya miliknya.
      const { data: own } = await admin
        .from('task_suggestions')
        .select('id')
        .eq('suggested_by', profile.id)
        .limit(500)
      scopedIds = ((own ?? []) as { id: string }[]).map((o) => o.id)
    }
  }

  let query = admin
    .from('task_suggestions')
    .select('id, code, title, project_id, status, suggested_by, created_at, updated_at')
    .order('created_at', { ascending: false })
    .limit(500)

  if (scopedIds !== null) {
    query = scopedIds.length > 0
      ? query.in('id', scopedIds)
      : query.eq('id', '00000000-0000-0000-0000-000000000000')
  }
  if (fStatus) query = query.eq('status', fStatus)

  const { data, error } = await query
  let suggestions = (data ?? []) as SuggestionListItem[]

  const projectIds = [...new Set(suggestions.map((s) => s.project_id))]
  let projectNames: Record<string, string> = {}
  if (projectIds.length > 0) {
    const { data: projects } = await admin
      .from('projects')
      .select('id, code, name')
      .in('id', projectIds)
    projectNames = Object.fromEntries(
      ((projects ?? []) as { id: string; code: string; name: string }[]).map((p) => [
        p.id,
        `${p.code} · ${p.name}`,
      ])
    )
  }

  if (q) {
    suggestions = suggestions.filter(
      (s) =>
        s.code.toLowerCase().startsWith(q) ||
        s.title.toLowerCase().includes(q) ||
        (projectNames[s.project_id] ?? '').toLowerCase().includes(q)
    )
  }

  const page = parsePage(params.page)
  const { pageItems, totalPages } = paginate(suggestions, page, 25)
  const safePage = Math.min(page, totalPages)

  return (
    <AppShell>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">
            {view === 'mine' ? 'My Suggestions' : 'Task Suggestions'}
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            {suggestions.length} suggestion{suggestions.length === 1 ? '' : 's'}
          </p>
        </div>
        <div className="flex gap-2">
          {view === 'mine' ? (
            <Link href="/task-suggestions" className="inline-flex min-h-[44px] items-center rounded-lg border px-4 py-2 text-sm font-semibold">
              All in Scope
            </Link>
          ) : (
            <Link href="/task-suggestions?view=mine" className="inline-flex min-h-[44px] items-center rounded-lg border px-4 py-2 text-sm font-semibold">
              My Suggestions
            </Link>
          )}
          {canCreate && (
            <Link
              href="/task-suggestions/new"
              className="inline-flex min-h-[44px] items-center rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white dark:bg-white dark:text-black"
            >
              + Suggest Task
            </Link>
          )}
        </div>
      </div>

      <form method="get" className="mt-4 flex flex-col gap-3 rounded-2xl bg-white p-4 shadow sm:flex-row sm:items-end dark:bg-zinc-900">
        {view === 'mine' && <input type="hidden" name="view" value="mine" />}
        <div className="flex-1">
          <label htmlFor="q" className="mb-1 block text-sm font-medium">Search</label>
          <input
            id="q"
            name="q"
            type="search"
            defaultValue={sanitize(str(params.q))}
            placeholder="Kode (S-001), judul, project"
            className="min-h-[44px] w-full rounded-lg border px-3 py-2 text-base dark:border-zinc-700 dark:bg-zinc-800"
          />
        </div>
        <div>
          <label htmlFor="status" className="mb-1 block text-sm font-medium">Status</label>
          <select
            id="status"
            name="status"
            defaultValue={fStatus}
            className="min-h-[44px] rounded-lg border px-3 py-2 text-base dark:border-zinc-700 dark:bg-zinc-800"
          >
            <option value="">All</option>
            {SUGGESTION_STATUSES.map((s) => (
              <option key={s} value={s}>
                {SUGGESTION_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="min-h-[44px] rounded-lg bg-black px-5 py-2 font-semibold text-white dark:bg-white dark:text-black">
          Apply
        </button>
      </form>

      {error ? (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm font-medium text-red-700 dark:bg-red-950 dark:text-red-300">
          Something went wrong. Please try again.
        </p>
      ) : suggestions.length === 0 ? (
        <p className="mt-4 rounded-2xl bg-white p-8 text-center text-sm text-zinc-500 shadow dark:bg-zinc-900">
          No suggestions found.
        </p>
      ) : (
        <>
        <ul className="mt-4 flex flex-col gap-3">
          {pageItems.map((s) => (
            <li key={s.id}>
              <Link
                href={`/task-suggestions/${s.id}`}
                className="block rounded-2xl bg-white p-4 shadow hover:shadow-md dark:bg-zinc-900"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-md bg-zinc-100 px-1.5 py-0.5 font-mono text-xs dark:bg-zinc-800">
                    {s.code}
                  </span>
                  <p className="font-semibold">{s.title}</p>
                  <span className={`ml-auto inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[s.status]}`}>
                    {SUGGESTION_STATUS_LABELS[s.status]}
                  </span>
                </div>
                <p className="mt-1 truncate text-sm text-zinc-500">
                  {projectNames[s.project_id] ?? '-'} &middot; {formatDate(s.created_at)}
                </p>
              </Link>
            </li>
          ))}
        </ul>
        <Pagination
          basePath="/task-suggestions"
          params={{
            ...(view === 'mine' ? { view: 'mine' } : {}),
            ...(sanitize(str(params.q)) ? { q: sanitize(str(params.q)) } : {}),
            ...(fStatus ? { status: fStatus } : {}),
          }}
          page={safePage}
          totalPages={totalPages}
          total={suggestions.length}
          label="suggestions"
        />
        </>
      )}
    </AppShell>
  )
}
