import Link from 'next/link'
import { requireProfile } from '@/lib/auth/session'
import { canViewClients, hasPermission } from '@/lib/auth/current-access'
import { redirect } from 'next/navigation'
import { ExportLink } from '@/components/export/ExportLink'
import { AppShell } from '@/components/layout/AppShell'
import { ButtonLink, EmptyState, KpiCard, PageHeader } from '@/components/ui/primitives'
import { loadLeads, loadNames, sanitizeLeadSearch } from '@/lib/clients/data'
import { STAGES, STAGE_LABEL, isStage, rupiah, summarize } from '@/lib/clients/pipeline'
import { getActiveUsers } from '@/lib/data/users'
import { displayName } from '@/lib/data/user-options'
import { formatDate } from '@/lib/utils/dates'

const SELECT = 'min-h-[44px] w-full rounded-lg border px-3 py-2 text-base dark:border-zinc-700 dark:bg-zinc-800'

/** Pipeline lead: ringkasan per tahap + daftar dengan filter tahap, PIC, dan nama. */
export default async function ClientsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const profile = await requireProfile()
  if (!(await canViewClients(profile.id))) redirect('/dashboard?denied=1')
  const params = await searchParams
  const str = (k: string) => (typeof params[k] === 'string' ? (params[k] as string) : '')
  const stage = isStage(str('stage')) ? str('stage') : ''
  const pic = str('pic')
  const q = sanitizeLeadSearch(str('q'))

  const [rows, all, users, canManage] = await Promise.all([
    loadLeads({ stage, pic, q }),
    loadLeads({}),
    getActiveUsers(),
    hasPermission(profile.id, 'clients.manage'),
  ])
  const names = await loadNames(rows.map((r) => r.owner_id))
  const summary = summarize(all)
  const exportQs = new URLSearchParams(Object.entries({ stage, pic, q }).filter(([, v]) => v)).toString()

  return (
    <AppShell>
      <PageHeader
        title="Client Management"
        subtitle={`${rows.length} lead${rows.length !== all.length ? ` dari ${all.length}` : ''}`}
        actions={
          <>
            <ExportLink href={`/clients/export${exportQs ? `?${exportQs}` : ''}`} />
            {canManage && <ButtonLink href="/clients/new">Tambah Lead</ButtonLink>}
          </>
        }
      />

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-6">
        {summary.map((s) => (
          <Link key={s.stage} href={`/clients?stage=${s.stage}`} className="block">
            <KpiCard label={`${STAGE_LABEL[s.stage]} · ${rupiah(s.total)}`} value={s.count} />
          </Link>
        ))}
      </div>

      <form method="get" className="mt-4 grid gap-3 rounded-2xl bg-white p-4 shadow sm:grid-cols-4 sm:items-end dark:bg-zinc-900">
        <div>
          <label htmlFor="f_stage" className="mb-1 block text-sm font-medium">Tahap</label>
          <select id="f_stage" name="stage" defaultValue={stage} className={SELECT}>
            <option value="">Semua tahap</option>
            {STAGES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="f_pic" className="mb-1 block text-sm font-medium">PIC</label>
          <select id="f_pic" name="pic" defaultValue={pic} className={SELECT}>
            <option value="">Semua PIC</option>
            <option value="none">Belum ada PIC</option>
            {users.map((u) => <option key={u.id} value={u.id}>{displayName(u)}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="f_q" className="mb-1 block text-sm font-medium">Cari perusahaan</label>
          <input id="f_q" name="q" type="search" defaultValue={q} placeholder="Nama perusahaan" className={SELECT} />
        </div>
        <button type="submit" className="min-h-[44px] rounded-lg bg-kasuat-gold px-5 py-2 font-semibold text-kasuat-black">Terapkan</button>
      </form>

      {rows.length === 0 ? (
        <div className="mt-4"><EmptyState title="Lead tidak ditemukan." message="Ubah filter, atau tambah lead baru." /></div>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-2xl bg-white shadow dark:bg-zinc-900">
          <table className="w-full text-left text-sm">
            <thead className="border-b text-xs uppercase text-zinc-600 dark:text-zinc-400">
              <tr>
                <th scope="col" className="px-4 py-3">Perusahaan</th>
                <th scope="col" className="px-4 py-3">Tahap</th>
                <th scope="col" className="px-4 py-3">Perkiraan nilai</th>
                <th scope="col" className="px-4 py-3">PIC</th>
                <th scope="col" className="px-4 py-3">Sumber</th>
                <th scope="col" className="px-4 py-3">Diubah</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((l) => (
                <tr key={l.id} className="border-b last:border-0">
                  <td className="px-4 py-3"><Link href={`/clients/${l.id}`} className="font-medium hover:underline">{l.company_name}</Link></td>
                  <td className="px-4 py-3">{STAGE_LABEL[l.stage]}</td>
                  <td className="px-4 py-3">{rupiah(l.estimated_value)}</td>
                  <td className="px-4 py-3">{l.owner_id ? names[l.owner_id] ?? '-' : '-'}</td>
                  <td className="px-4 py-3">{l.source ?? '-'}</td>
                  <td className="px-4 py-3">{formatDate(l.updated_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  )
}
