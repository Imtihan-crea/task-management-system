import Link from 'next/link'
import { requirePermission } from '@/lib/auth/current-access'
import { createAdminClient } from '@/lib/supabase/admin'
import { AppShell } from '@/components/layout/AppShell'
import { PageHeader } from '@/components/ui/primitives'
import { loadComments, loadLogs, loadMonthBasis, loadReviewLogs, loadRules } from '@/lib/hr/data'
import { ReviewLogList } from '@/components/tracker/ReviewLogList'
import { hasPermission } from '@/lib/auth/current-access'
import { STATUS_LABEL, breakdown, monthRange, monthlySummary, type Breakdown } from '@/lib/hr/tracker'
import { todayISO } from '@/lib/utils/dates'

type Person = { id: string; full_name: string | null; email: string; division: string | null; position_title: string | null }

const num = (n: number) => n.toLocaleString('id-ID', { maximumFractionDigits: 2 })
const INPUT = 'rounded-lg border px-3 py-2 text-base dark:border-zinc-700 dark:bg-zinc-800'

function BreakdownTable({ title, rows, keyLabel }: { title: string; rows: Breakdown[]; keyLabel: string }) {
  return (
    <div>
      <h3 className="mb-2 font-semibold">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">Tidak ada data.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-zinc-600 dark:text-zinc-400">
              <th className="py-2 pr-3">{keyLabel}</th>
              <th className="py-2 pr-3 text-right">Jam</th>
              <th className="py-2 pr-3 text-right">Aktivitas</th>
              <th className="py-2 text-right">%</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-b last:border-0">
                <td className="py-2 pr-3">{r.key}</td>
                <td className="py-2 pr-3 text-right">{num(r.hours)}</td>
                <td className="py-2 pr-3 text-right">{r.count}</td>
                <td className="py-2 text-right">{num(r.percent)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

/** Rekap Daily Tracker semua karyawan (sheet Monthly Summary + Month Track). Izin hr.view. */
export default async function TrackerRekapPage({
  searchParams,
}: {
  searchParams: Promise<{ bulan?: string; divisi?: string; orang?: string }>
}) {
  const viewer = await requirePermission('hr.view')
  const canManageHr = await hasPermission(viewer.id, 'hr.manage')
  const sp = await searchParams
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.bulan ?? '') ? sp.bulan! : todayISO().slice(0, 7)
  const [from, to] = monthRange(month)

  const [peopleRes, logs, basis, rules] = await Promise.all([
    createAdminClient()
      .from('profiles')
      .select('id, full_name, email, division, position_title')
      .eq('status', 'ACTIVE')
      .order('full_name'),
    loadLogs(from, to),
    loadMonthBasis(month),
    loadRules(to),
  ])
  const everyone = (peopleRes.data ?? []) as Person[]
  const divisions = [...new Set(everyone.map((p) => p.division).filter((d): d is string => !!d))].sort()
  const people = sp.divisi ? everyone.filter((p) => p.division === sp.divisi) : everyone
  const byUser = new Map<string, typeof logs>()
  for (const l of logs) byUser.set(l.user_id, [...(byUser.get(l.user_id) ?? []), l])
  const rows = people.map((p) => ({ p, s: monthlySummary(byUser.get(p.id) ?? [], basis.workdays.length, rules, basis.lockedTarget) }))
  const focus = sp.orang ? everyone.find((p) => p.id === sp.orang) : undefined
  const focusLogs = focus ? byUser.get(focus.id) ?? [] : []
  const focusEntries = focus ? await loadReviewLogs({ userId: focus.id, from, to }) : []
  const focusComments = await loadComments(focusEntries.map((l) => l.id))
  const qs = (extra: Record<string, string>) =>
    new URLSearchParams({ bulan: month, ...(sp.divisi ? { divisi: sp.divisi } : {}), ...extra }).toString()

  return (
    <AppShell>
      <PageHeader
        title="Rekap Daily Tracker"
        subtitle={`Hari kerja ${basis.workdays.length}, target ${basis.lockedTarget ?? basis.workdays.length * rules.hoursPerDay} jam${basis.lockedTarget ? ' (dikunci HR)' : ''}.`}
        actions={
          canManageHr ? (
            <div className="flex gap-3 text-sm font-semibold">
              <Link href="/tracker/import" className="text-kasuat-deep-gold hover:underline">Import histori Excel</Link>
              <Link href="/settings/hr" className="text-kasuat-deep-gold hover:underline">Pengaturan HR</Link>
            </div>
          ) : undefined
        }
      />

      <form className="mt-4 flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="bulan" className="mb-1 block text-sm font-medium">Bulan</label>
          <input id="bulan" name="bulan" type="month" defaultValue={month} className={INPUT} />
        </div>
        <div>
          <label htmlFor="divisi" className="mb-1 block text-sm font-medium">Divisi</label>
          <select id="divisi" name="divisi" defaultValue={sp.divisi ?? ''} className={INPUT}>
            <option value="">Semua</option>
            {divisions.map((d) => <option key={d}>{d}</option>)}
          </select>
        </div>
        <button type="submit" className="min-h-[44px] rounded-lg bg-kasuat-gold px-4 py-2 font-semibold text-kasuat-black">Tampilkan</button>
      </form>

      <section className="mt-6 overflow-x-auto rounded-2xl bg-white p-5 shadow dark:bg-zinc-900">
        <h2 className="mb-3 text-lg font-bold">Ringkasan bulanan</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-zinc-600 dark:text-zinc-400">
              <th className="py-2 pr-3">Nama</th>
              <th className="py-2 pr-3">Divisi</th>
              <th className="py-2 pr-3 text-right">Total jam</th>
              <th className="py-2 pr-3 text-right">Efektivitas</th>
              <th className="py-2 pr-3 text-right">Aktivitas</th>
              <th className="py-2 pr-3 text-right">Hari aktif</th>
              <th className="py-2 pr-3 text-right">Jam/hari</th>
              <th className="py-2 pr-3 text-right">Jam/aktivitas</th>
              <th className="py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ p, s }) => (
              <tr key={p.id} className="border-b last:border-0">
                <td className="py-2 pr-3">
                  <Link href={`/tracker/rekap?${qs({ orang: p.id })}`} className="font-semibold text-kasuat-deep-gold hover:underline">
                    {p.full_name || p.email}
                  </Link>
                </td>
                <td className="py-2 pr-3">{p.division ?? '-'}</td>
                <td className="py-2 pr-3 text-right">{num(s.totalHours)}</td>
                <td className="py-2 pr-3 text-right">{num(s.effectiveness)}%</td>
                <td className="py-2 pr-3 text-right">{s.activities}</td>
                <td className="py-2 pr-3 text-right">{s.activeDays}</td>
                <td className="py-2 pr-3 text-right">{num(s.avgHoursPerActiveDay)}</td>
                <td className="py-2 pr-3 text-right">{num(s.avgHoursPerActivity)}</td>
                <td className="py-2">{STATUS_LABEL[s.status]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {focus && (
        <section className="mt-6 rounded-2xl bg-white p-5 shadow dark:bg-zinc-900">
          <h2 className="mb-3 text-lg font-bold">Rincian {focus.full_name || focus.email}</h2>
          <div className="grid gap-6 lg:grid-cols-2">
            <BreakdownTable title="Jam per proyek" keyLabel="Proyek" rows={breakdown(focusLogs, 'project_name')} />
            <BreakdownTable title="Jam per kategori" keyLabel="Kategori" rows={breakdown(focusLogs, 'category')} />
          </div>
          <h3 className="mt-6 mb-2 font-semibold">Aktivitas ({focusEntries.length})</h3>
          <ReviewLogList logs={focusEntries} comments={focusComments} showPerson={false} showProject />
        </section>
      )}
    </AppShell>
  )
}
