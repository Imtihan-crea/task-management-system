import Link from 'next/link'
import { requireProfile } from '@/lib/auth/session'
import { loadWorkstreams, sanitizeWorkstreamSearch } from '@/lib/data/workstream-list'
import { ExportLink } from '@/components/export/ExportLink'
import { AppShell } from '@/components/layout/AppShell'
import { PageHeader, EmptyState } from '@/components/ui/primitives'
import { hasPermission } from '@/lib/auth/current-access'
import { BulkBar, BulkCheckbox, BulkSelectProvider } from '@/components/ui/BulkSelect'
import { bulkDeleteWorkstreams } from '@/app/actions/workstreams'

export default async function WorkstreamsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const profile = await requireProfile()
  const params = await searchParams
  const qRaw = typeof params.q === 'string' ? params.q : ''
  const q = sanitizeWorkstreamSearch(qRaw).toLowerCase()

  const [{ workstreams, projectNames, taskCounts }, canDelete] = await Promise.all([
    loadWorkstreams(profile, q),
    hasPermission(profile.id, 'workstreams.delete'),
  ])

  return (
    <AppShell>
      <PageHeader
        title="Workstreams"
        subtitle={`${workstreams.length} workstream`}
        actions={<ExportLink href={`/workstreams/export${q ? `?q=${encodeURIComponent(q)}` : ''}`} />}
      />

      <form method="get" className="mt-4 grid grid-cols-[1fr_auto] items-end gap-3 rounded-2xl border border-zinc-200 bg-white p-3 sm:flex sm:p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="col-span-2 sm:flex-1">
          <label htmlFor="q" className="mb-1 block text-sm font-medium">Cari</label>
          <input
            id="q"
            name="q"
            type="search"
            defaultValue={qRaw}
            placeholder="Nama workstream"
            className="min-h-[44px] w-full rounded-lg border px-3 py-2 text-base dark:border-zinc-700 dark:bg-zinc-800"
          />
        </div>
        <button type="submit" className="min-h-[44px] rounded-lg bg-kasuat-gold px-5 py-2 font-semibold text-kasuat-black">
          Terapkan
        </button>
      </form>

      {workstreams.length === 0 ? (
        <div className="mt-4">
          <EmptyState title="Workstream tidak ditemukan." message="Workstream dikelola di dalam setiap Project." />
        </div>
      ) : (
        <BulkSelectProvider ids={workstreams.map((w) => w.id)}>
          <BulkBar
            noun="workstream"
            actions={canDelete ? [{ key: 'delete', label: 'Hapus', run: bulkDeleteWorkstreams, danger: true }] : []}
            exportHref={`/workstreams/export${q ? `?q=${encodeURIComponent(q)}` : ''}`}
          />
          <div className="mt-3 hidden scroll-x-hint overflow-x-auto rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 md:block dark:bg-zinc-900">
            <table className="w-full text-left text-sm">
              <thead className="border-b text-xs uppercase text-zinc-600 dark:text-zinc-400">
                <tr>
                  <th scope="col" className="w-12 py-3 pl-2"><span className="sr-only">Pilih</span></th>
                  <th scope="col" className="px-4 py-3">Kode</th>
                  <th scope="col" className="px-4 py-3">Nama</th>
                  <th scope="col" className="px-4 py-3">Project</th>
                  <th scope="col" className="px-4 py-3">Tasks</th>
                </tr>
              </thead>
              <tbody>
                {workstreams.map((w) => (
                  <tr key={w.id} className="border-b last:border-0">
                    <td className="py-1 pl-2"><BulkCheckbox id={w.id} label={`${w.code} ${w.name}`} /></td>
                    <td className="px-4 py-3 font-mono text-xs">{w.code}</td>
                    <td className="px-4 py-3">
                      <Link href={`/projects/${w.project_id}`} className="font-medium hover:underline">
                        {w.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3">{projectNames[w.project_id] ?? '-'}</td>
                    <td className="px-4 py-3">{taskCounts[w.id] ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="mt-4 flex flex-col gap-3 md:hidden">
            {workstreams.map((w) => (
              <li key={w.id} className="flex items-start rounded-2xl bg-white shadow-sm dark:bg-zinc-900">
                <BulkCheckbox id={w.id} label={`${w.code} ${w.name}`} className="mt-2 ml-1" />
                <Link
                  href={`/projects/${w.project_id}`}
                  className="block min-w-0 flex-1 rounded-2xl py-4 pr-4 pl-1"
                >
                  <p className="font-semibold">
                    <span className="mr-2 rounded-md bg-zinc-100 px-1.5 py-0.5 font-mono text-xs dark:bg-zinc-800">
                      {w.code}
                    </span>
                    {w.name}
                  </p>
                  <p className="mt-0.5 truncate text-sm text-zinc-600 dark:text-zinc-400">
                    {projectNames[w.project_id] ?? '-'} &middot; {taskCounts[w.id] ?? 0} tasks
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </BulkSelectProvider>
      )}
    </AppShell>
  )
}
