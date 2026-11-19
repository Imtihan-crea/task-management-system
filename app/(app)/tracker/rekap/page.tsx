import Link from 'next/link'
import { requirePermission } from '@/lib/auth/current-access'
import { AppShell } from '@/components/layout/AppShell'
import { PageHeader } from '@/components/ui/primitives'
import { loadComments, loadReviewLogs } from '@/lib/hr/data'
import { loadRekap } from '@/lib/hr/rekap'
import { parsePeriod } from '@/lib/hr/period'
import { BreakdownTable } from '@/components/tracker/BreakdownTable'
import { PeriodFilter } from '@/components/tracker/PeriodFilter'
import { ExportLink } from '@/components/export/ExportLink'
import { ReviewLogList } from '@/components/tracker/ReviewLogList'
import { hasPermission } from '@/lib/auth/current-access'
import { STATUS_LABEL, breakdown } from '@/lib/hr/tracker'
import { todayISO } from '@/lib/utils/dates'

const num = (n: number) => n.toLocaleString('id-ID', { maximumFractionDigits: 2 })
/** Rekap Daily Tracker semua karyawan (sheet Monthly Summary + Month Track). Izin hr.view. */
export default async function TrackerRekapPage({
  searchParams,
}: {
  searchParams: Promise<{ periode?: string; minggu?: string; bulan?: string; dari?: string; sampai?: string; divisi?: string; orang?: string }>
}) {
  const viewer = await requirePermission('hr.view')
  const canManageHr = await hasPermission(viewer.id, 'hr.manage')
  const sp = await searchParams
  const { period, error } = parsePeriod(sp, todayISO())
  const { from, to, everyone, divisions, people, byUser, rows, basis, rules } = await loadRekap(period, sp.divisi)
  const allLogs = people.flatMap((p) => byUser.get(p.id) ?? [])
  const focus = sp.orang ? everyone.find((p) => p.id === sp.orang) : undefined
  const focusLogs = focus ? byUser.get(focus.id) ?? [] : []
  const focusEntries = focus ? await loadReviewLogs({ userId: focus.id, from, to }) : []
  const focusComments = await loadComments(focusEntries.map((l) => l.id))
  const qs = (extra: Record<string, string>) =>
    new URLSearchParams({ ...period.query, ...(sp.divisi ? { divisi: sp.divisi } : {}), ...extra }).toString()

  return (
    <AppShell>
      <PageHeader
        title="Rekap Daily Tracker"
        subtitle={`${period.label}. Hari kerja ${basis.workdays.length}, target ${(period.month && basis.lockedTarget) || basis.workdays.length * rules.hoursPerDay} jam${period.month && basis.lockedTarget ? ' (dikunci HR)' : ''}.`}
        actions={
          <div className="flex flex-wrap items-center gap-3 text-sm font-semibold">
            <ExportLink href={`/tracker/rekap/export?${qs({})}`} />
            {canManageHr && (
              <>
                <Link href="/tracker/import" className="text-kasuat-deep-gold hover:underline">Import histori Excel</Link>
                <Link href="/settings/hr" className="text-kasuat-deep-gold hover:underline">Pengaturan HR</Link>
              </>
            )}
          </div>
        }
      />

      <PeriodFilter period={period} error={error} base="/tracker/rekap" keep={sp.orang ? { orang: sp.orang } : {}} navKeep={sp.divisi ? { divisi: sp.divisi } : {}}>
        <div>
          <label htmlFor="divisi" className="mb-1 block text-sm font-medium">Divisi</label>
          <select id="divisi" name="divisi" defaultValue={sp.divisi ?? ''} className="rounded-lg border px-3 py-2 text-base dark:border-zinc-700 dark:bg-zinc-800">
            <option value="">Semua</option>
            {divisions.map((d) => <option key={d}>{d}</option>)}
          </select>
        </div>
      </PeriodFilter>

      <section className="mt-6 overflow-x-auto rounded-2xl bg-white p-5 shadow dark:bg-zinc-900">
        <h2 className="mb-3 text-lg font-bold">Ringkasan periode</h2>
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
              <th className="py-2 pr-3 text-right">Target</th>
              <th className="py-2 pr-3 text-right">Cuti</th>
              <th className="py-2 pr-3 text-right">Izin</th>
              <th className="py-2 pr-3 text-right">Sakit</th>
              <th className="py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ p, s, l }) => (
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
                <td className="py-2 pr-3 text-right">{num(s.targetHours)}</td>
                <td className="py-2 pr-3 text-right">{l.CUTI}</td>
                <td className="py-2 pr-3 text-right">{l.IZIN}</td>
                <td className="py-2 pr-3 text-right">{l.SAKIT}</td>
                <td className="py-2">{STATUS_LABEL[s.status]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="mt-6 rounded-2xl bg-white p-5 shadow dark:bg-zinc-900">
        <h2 className="mb-3 text-lg font-bold">Jam per klien (semua orang di tabel)</h2>
        <BreakdownTable title="Ke klien mana waktu terpakai" keyLabel="Klien" rows={breakdown(allLogs, 'client')} />
      </section>

      {focus && (
        <section className="mt-6 rounded-2xl bg-white p-5 shadow dark:bg-zinc-900">
          <h2 className="mb-3 text-lg font-bold">Rincian {focus.full_name || focus.email}</h2>
          <div className="grid gap-6 lg:grid-cols-2">
            <BreakdownTable title="Jam per klien" keyLabel="Klien" rows={breakdown(focusLogs, 'client')} />
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
