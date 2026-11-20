import Link from 'next/link'
import { requirePermission } from '@/lib/auth/current-access'
import { AppShell } from '@/components/layout/AppShell'
import { ButtonLink, FIELD, FIELD_LABEL, PageHeader } from '@/components/ui/primitives'
import { loadComments, loadReferences, loadReviewLogs } from '@/lib/hr/data'
import { loadRekap } from '@/lib/hr/rekap'
import { parsePeriod } from '@/lib/hr/period'
import { BreakdownTable } from '@/components/tracker/BreakdownTable'
import { PeriodFilter } from '@/components/tracker/PeriodFilter'
import { ExportLink } from '@/components/export/ExportLink'
import { ReviewLogList } from '@/components/tracker/ReviewLogList'
import { hasPermission } from '@/lib/auth/current-access'
import { STATUS_LABEL, breakdown } from '@/lib/hr/tracker'
import { todayISO } from '@/lib/utils/dates'
import { BulkBar, BulkCheckbox, BulkSelectProvider } from '@/components/ui/BulkSelect'

const num = (n: number) => n.toLocaleString('id-ID', { maximumFractionDigits: 2 })
/** Rekap Daily Tracker semua karyawan (sheet Monthly Summary + Month Track). Izin hr.view. */
export default async function TrackerRekapPage({
  searchParams,
}: {
  searchParams: Promise<{ periode?: string; minggu?: string; bulan?: string; dari?: string; sampai?: string; divisi?: string; orang?: string; proyek?: string }>
}) {
  const viewer = await requirePermission('hr.view')
  const canManageHr = await hasPermission(viewer.id, 'hr.manage')
  const sp = await searchParams
  const { period, error } = parsePeriod(sp, todayISO())
  const { from, to, everyone, divisions, people, byUser, rows, basis, rules, leaveColumns } = await loadRekap(period, sp.divisi)
  const allLogs = people.flatMap((p) => byUser.get(p.id) ?? [])
  const focus = sp.orang ? everyone.find((p) => p.id === sp.orang) : undefined
  const focusLogs = focus ? byUser.get(focus.id) ?? [] : []
  // PM View (sheet "Month Track 2026 - PM View"): pilih proyek, opsional per orang.
  const proyek = sp.proyek?.trim() || ''
  const projectRefs = await loadReferences(['INTERNAL_PROJECT'])
  const projectOptions = [...new Set([...projectRefs.filter((r) => !r.archived_at).map((r) => r.label), ...allLogs.map((l) => l.project_name)])].sort((a, b) => a.localeCompare(b, 'id'))
  const shownIds = new Set(people.map((p) => p.id))
  const pmLogs = proyek ? (focus ? focusLogs : allLogs).filter((l) => l.project_name === proyek) : []
  const nameOf = new Map(everyone.map((p) => [p.id, p.full_name || p.email]))
  const pmEntries = proyek
    ? (await loadReviewLogs({ userId: focus?.id, from, to })).filter((l) => l.project === proyek && shownIds.has(l.user_id))
    : []
  const focusEntries = focus ? await loadReviewLogs({ userId: focus.id, from, to }) : []
  const [focusComments, pmComments] = await Promise.all([loadComments(focusEntries.map((l) => l.id)), loadComments(pmEntries.map((l) => l.id))])
  const qs = (extra: Record<string, string>) =>
    new URLSearchParams({ ...period.query, ...(sp.divisi ? { divisi: sp.divisi } : {}), ...(proyek ? { proyek } : {}), ...extra }).toString()

  return (
    <AppShell>
      <PageHeader
        title="Rekap Daily Tracker"
        subtitle={`${period.label}. Hari kerja ${basis.workdays.length}, target ${(period.month && basis.lockedTarget) || basis.workdays.length * rules.hoursPerDay} jam${period.month && basis.lockedTarget ? ' (dikunci HR)' : ''}.`}
        actions={
          <>
            {canManageHr && (
              <>
                <ButtonLink href="/tracker/import" variant="secondary">Import histori Excel</ButtonLink>
                <ButtonLink href="/settings/hr" variant="secondary">Pengaturan HR</ButtonLink>
              </>
            )}
            <ExportLink href={`/tracker/rekap/export?${qs({})}`} />
          </>
        }
      />

      <PeriodFilter period={period} error={error} base="/tracker/rekap" keep={sp.orang ? { orang: sp.orang } : {}} navKeep={{ ...(sp.divisi ? { divisi: sp.divisi } : {}), ...(proyek ? { proyek } : {}) }}>
        <div>
          <label htmlFor="divisi" className={FIELD_LABEL}>Divisi</label>
          <select id="divisi" name="divisi" defaultValue={sp.divisi ?? ''} className={FIELD}>
            <option value="">Semua</option>
            {divisions.map((d) => <option key={d}>{d}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="proyek" className="mb-1 block text-sm font-medium">Proyek (PM View)</label>
          <select id="proyek" name="proyek" defaultValue={proyek} className="rounded-lg border px-3 py-2 text-base dark:border-zinc-700 dark:bg-zinc-800">
            <option value="">Semua</option>
            {projectOptions.map((p) => <option key={p}>{p}</option>)}
          </select>
        </div>
      </PeriodFilter>

      <section className="mt-6 rounded-2xl bg-white p-4 shadow-sm sm:p-5 dark:bg-zinc-900">
        <h2 className="mb-3 text-lg font-bold">Ringkasan periode</h2>
        <BulkSelectProvider ids={rows.map(({ p }) => p.id)}>
        <BulkBar noun="orang" exportHref={`/tracker/rekap/export?${qs({})}`} />
        <div className="scroll-x-hint mt-2 overflow-x-auto">
        <table className="w-full whitespace-nowrap text-sm">
          <thead>
            <tr className="border-b text-left text-zinc-600 dark:text-zinc-400">
              <th className="w-12 py-2"><span className="sr-only">Pilih</span></th>
              <th className="sticky left-0 z-10 bg-white py-2 pr-3 dark:bg-zinc-900">Nama</th>
              <th className="py-2 pr-3">Divisi</th>
              <th className="py-2 pr-3 text-right">Total jam</th>
              <th className="py-2 pr-3 text-right">Efektivitas</th>
              <th className="py-2 pr-3 text-right">Aktivitas</th>
              <th className="py-2 pr-3 text-right">Hari aktif</th>
              <th className="py-2 pr-3 text-right">Jam/hari</th>
              <th className="py-2 pr-3 text-right">Jam/aktivitas</th>
              <th className="py-2 pr-3 text-right">Target</th>
              {leaveColumns.map((t) => <th key={t.code} className="py-2 pr-3 text-right">{t.label}</th>)}
              <th className="py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ p, s, l }) => (
              <tr key={p.id} className="border-b last:border-0">
                <td className="py-0"><BulkCheckbox id={p.id} label={p.full_name || p.email} /></td>
                <td className="sticky left-0 z-10 bg-white py-2 pr-3 dark:bg-zinc-900">
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
                {leaveColumns.map((t) => <td key={t.code} className="py-2 pr-3 text-right">{l[t.code] ?? 0}</td>)}
                <td className="py-2">{STATUS_LABEL[s.status]}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        </BulkSelectProvider>
      </section>

      {proyek && (
        <section className="mt-6 rounded-2xl bg-white p-4 shadow-sm sm:p-5 dark:bg-zinc-900">
          <h2 className="mb-3 text-lg font-bold">PM View: {proyek}{focus ? ` (${focus.full_name || focus.email})` : ''}</h2>
          {pmLogs.length === 0 ? (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">Belum ada aktivitas untuk proyek ini di periode ini.</p>
          ) : (
            <div className="grid gap-6 lg:grid-cols-2">
              <BreakdownTable title="Jam per orang" keyLabel="Nama" rows={breakdown(pmLogs.map((l) => ({ ...l, project_name: nameOf.get(l.user_id) ?? '-' })), 'project_name')} />
              <BreakdownTable title="Jam per kategori" keyLabel="Kategori" rows={breakdown(pmLogs, 'category')} />
            </div>
          )}
          <h3 className="mt-6 mb-2 font-semibold">Aktivitas ({pmEntries.length})</h3>
          <ReviewLogList logs={pmEntries} comments={pmComments} showPerson={!focus} showProject={false} />
        </section>
      )}

      <section className="mt-6 rounded-2xl bg-white p-4 shadow-sm sm:p-5 dark:bg-zinc-900">
        <h2 className="mb-3 text-lg font-bold">Jam per proyek (semua orang di tabel)</h2>
        <BreakdownTable title="Ke proyek mana waktu terpakai" keyLabel="Proyek" rows={breakdown(allLogs, 'project_name')} />
      </section>

      {focus && (
        <section className="mt-6 rounded-2xl bg-white p-4 shadow-sm sm:p-5 dark:bg-zinc-900">
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
