import { requirePermission } from '@/lib/auth/current-access'
import { createAdminClient } from '@/lib/supabase/admin'
import { AppShell } from '@/components/layout/AppShell'
import { PageHeader } from '@/components/ui/primitives'
import { AddReferenceForm, ArchiveReferenceButton, EditReferenceForm, PromoteForm } from '@/components/master-reference/ReferenceForms'
import { loadReferences } from '@/lib/hr/data'
import { REFERENCE_LISTS, groupFreeText, type ReferenceList, type Suggestion } from '@/lib/hr/reference'
import { formatDate } from '@/lib/utils/dates'
import { allRows } from '@/lib/utils/paginate'

async function freeText(list: ReferenceList): Promise<Suggestion[]> {
  const col = { ACTIVITY_CATEGORY: ['category', 'category_ref'], WORK_LOCATION: ['location', 'location_ref'], INTERNAL_PROJECT: ['project_name', 'internal_project_ref'] }[
    list as 'ACTIVITY_CATEGORY'
  ]
  if (!col) return []
  const data = await allRows<{ text: string; date: string }>((from, to) => {
    let q = createAdminClient().from('work_logs').select(`text:${col[0]}, date:work_date`).is(col[1], null).order('id').range(from, to)
    if (list === 'INTERNAL_PROJECT') q = q.is('project_id', null)
    return q
  })
  return groupFreeText(data)
}

/** Master Reference: daftar pilihan HR/Daily Tracker. Izin reference.manage. */
export default async function MasterReferencePage() {
  await requirePermission('reference.manage')
  const [refs, suggestions] = await Promise.all([
    loadReferences(),
    Promise.all(REFERENCE_LISTS.map((l) => (l.freeText ? freeText(l.list) : Promise.resolve([])))),
  ])

  return (
    <AppShell>
      <PageHeader
        title="Master Reference"
        subtitle="Pilihan tidak bisa dihapus, hanya diarsipkan. Label hanya boleh ditambah, tidak diganti. Teks bebas dari staf muncul sebagai usulan."
      />
      {REFERENCE_LISTS.map((l, i) => {
        const rows = refs.filter((r) => r.list === l.list)
        const activeRows = rows.filter((r) => !r.archived_at)
        const archived = rows.filter((r) => r.archived_at)
        return (
          <section key={l.list} id={l.list} className="mt-6 rounded-2xl bg-white p-5 shadow dark:bg-zinc-900">
            <h2 className="text-lg font-bold">{l.title}</h2>
            <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-400">{l.hint}</p>
            <div className="relative overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-zinc-600 dark:text-zinc-400">
                    <th className="py-2 pr-3">Label</th>
                    <th className="py-2 pr-3">Kode</th>
                    <th className="py-2 pr-3">Penjelasan</th>
                    <th className="py-2"><span className="sr-only">Tindakan</span></th>
                  </tr>
                </thead>
                <tbody>
                  {[...activeRows, ...archived].map((r) => (
                    <tr key={r.id} className={`border-b align-top last:border-0 ${r.archived_at ? 'text-zinc-500' : ''}`}>
                      <td className="py-2 pr-3 font-medium">
                        {r.label}
                        {r.archived_at && <span className="ml-1 text-xs">(arsip)</span>}
                        {!r.archived_at && <EditReferenceForm id={r.id} label={r.label} description={r.description} />}
                      </td>
                      <td className="py-2 pr-3 font-mono text-xs">{r.code}</td>
                      <td className="py-2 pr-3">{r.description ?? '-'}</td>
                      <td className="py-2 whitespace-nowrap">
                        <ArchiveReferenceButton id={r.id} label={r.label} archived={Boolean(r.archived_at)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4">
              <AddReferenceForm list={l.list} />
            </div>
            {l.freeText && (
              <div className="mt-5">
                <h3 className="font-semibold">Usulan dari teks bebas staf</h3>
                {suggestions[i].length === 0 ? (
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">Belum ada.</p>
                ) : (
                  <ul className="mt-2 divide-y">
                    {suggestions[i].map((s) => (
                      <li key={s.text} className="flex flex-wrap items-end justify-between gap-2 py-2">
                        <div>
                          <p className="font-medium">{s.text}</p>
                          <p className="text-xs text-zinc-600 dark:text-zinc-400">
                            {s.count} entri, terakhir {formatDate(s.lastDate)}
                          </p>
                        </div>
                        <PromoteForm list={l.list} text={s.text} targets={activeRows.map((r) => ({ id: r.id, label: r.label }))} />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </section>
        )
      })}
    </AppShell>
  )
}
