import Link from 'next/link'
import { requireProfile } from '@/lib/auth/session'
import { hasPermission } from '@/lib/auth/current-access'
import { createAdminClient } from '@/lib/supabase/admin'
import { ExportLink } from '@/components/export/ExportLink'
import { AppShell } from '@/components/layout/AppShell'
import { KpiCard, PageHeader } from '@/components/ui/primitives'
import { WorkLogForm, DeleteWorkLogButton, type WorkLogValues } from '@/components/tracker/WorkLogForm'
import { loadComments, loadLeave, loadLogs, loadMonthBasis, loadPeriodBasis, loadReferences, loadRules } from '@/lib/hr/data'
import { parsePeriod, periodSummary } from '@/lib/hr/period'
import { BreakdownTable } from '@/components/tracker/BreakdownTable'
import { PeriodFilter } from '@/components/tracker/PeriodFilter'
import { leaveDaysIn, paidLeaveDays, type LeaveRow } from '@/lib/hr/leave'
import { CommentThread } from '@/components/tracker/ReviewLogList'
import {
  STATUS_LABEL, addDays, breakdown, dailyStatus, isoWeek, monthRange, monthlySummary, suggestStart, weekStart, weeklyStatus,
  type LogRow,
} from '@/lib/hr/tracker'
import { formatDate, todayISO } from '@/lib/utils/dates'

type DbRow = Omit<WorkLogValues, 'project'> & {
  work_date: string
  project_id: string | null
  project_name: string
  internal_project_ref: string | null
  category_ref: string | null
  location_ref: string | null
  duration_minutes: number
}
type Row = DbRow & WorkLogValues

const hours = (min: number) => (min / 60).toLocaleString('id-ID', { maximumFractionDigits: 2 })

export default async function TrackerPage({ searchParams }: { searchParams: Promise<{ tanggal?: string; ubah?: string; periode?: string; minggu?: string; bulan?: string; dari?: string; sampai?: string }> }) {
  const profile = await requireProfile()
  const sp = await searchParams
  const today = todayISO()
  const date = /^\d{4}-\d{2}-\d{2}$/.test(sp.tanggal ?? '') && sp.tanggal! <= today ? sp.tanggal! : today
  const month = date.slice(0, 7)
  const [monthFrom, monthTo] = monthRange(month)
  const wFrom = weekStart(date)
  const from = wFrom < monthFrom ? wFrom : monthFrom
  const to = addDays(wFrom, 6) > monthTo ? addDays(wFrom, 6) : monthTo

  const { period, error: periodError } = parsePeriod(sp, today)
  const [rules, refs, basis, logsRes, canRekap, periodLogs, periodBasis, periodLeave, ownProfile] = await Promise.all([
    loadRules(date),
    loadReferences(['ACTIVITY_CATEGORY', 'WORK_LOCATION', 'INTERNAL_PROJECT']),
    loadMonthBasis(month),
    createAdminClient()
      .from('work_logs')
      .select('id, work_date, project_id, project_name, internal_project_ref, activity, detail, start_time, end_time, duration_minutes, location, location_ref, category, category_ref, output')
      .eq('user_id', profile.id)
      .gte('work_date', from)
      .lte('work_date', to)
      .order('start_time'),
    hasPermission(profile.id, 'hr.view'),
    loadLogs(period.from, period.to, [profile.id]),
    loadPeriodBasis(period.from, period.to, period.month),
    loadLeave({ from: period.from, to: period.to, userId: profile.id, statuses: ['APPROVED'] }),
    createAdminClient().from('profiles').select('division').eq('id', profile.id).maybeSingle(),
  ])
  const periodOwnLeave = leaveDaysIn(periodLeave as LeaveRow[], period.from, period.to, periodBasis.calendar)
  const periodSum = periodSummary(period, periodLogs, periodBasis.workdays.length, rules, periodBasis.lockedTarget, paidLeaveDays(periodOwnLeave))
  // Tampilkan label master terkini bila tertaut; teks bebas apa adanya.
  const label = new Map(refs.map((r) => [r.id, r.label]))
  const logs: Row[] = ((logsRes.data ?? []) as DbRow[]).map((l) => {
    const project = l.project_id ? l.project_name : l.internal_project_ref ? label.get(l.internal_project_ref) ?? l.project_name : l.project_name
    const category = l.category_ref ? label.get(l.category_ref) ?? l.category : l.category
    const location = l.location_ref ? label.get(l.location_ref) ?? l.location : l.location
    return { ...l, project, category, location }
  })
  const active = (list: string) => refs.filter((r) => r.list === list && !r.archived_at).map((r) => r.label)
  const dayLogs = logs.filter((l) => l.work_date === date)
  const weekLogs = logs.filter((l) => l.work_date >= wFrom && l.work_date <= addDays(wFrom, 6))
  const monthLogs: LogRow[] = logs
    .filter((l) => l.work_date >= monthFrom && l.work_date <= monthTo)
    .map((l) => ({ user_id: profile.id, work_date: l.work_date, project_name: l.project, category: l.category, duration_minutes: l.duration_minutes }))
  const sum = (rows: { duration_minutes: number }[]) => rows.reduce((s, l) => s + l.duration_minutes, 0)
  const ownLeave = leaveDaysIn((await loadLeave({ from: monthFrom, to: monthTo, userId: profile.id, statuses: ['APPROVED'] })) as LeaveRow[], monthFrom, monthTo, basis.calendar)
  const summary = monthlySummary(monthLogs, basis.workdays.length, rules, basis.lockedTarget, paidLeaveDays(ownLeave))
  const comments = await loadComments(dayLogs.map((l) => l.id))
  const pq = new URLSearchParams(period.query).toString()
  const editing = sp.ubah ? dayLogs.find((l) => l.id === sp.ubah) ?? null : null

  return (
    <AppShell>
      <PageHeader
        title="Daily Tracker"
        subtitle="Catat setiap ganti pekerjaan, jangan ditunda sampai akhir hari."
        actions={
          <div className="flex flex-wrap items-center gap-3">
            {canRekap && (
              <Link href="/tracker/rekap" className="text-sm font-semibold text-kasuat-deep-gold hover:underline">
                Rekap semua karyawan
              </Link>
            )}
            <ExportLink href={`/tracker/export?${pq}`} />
          </div>
        }
      />

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label={`Jam ${formatDate(date)} (${STATUS_LABEL[dailyStatus(sum(dayLogs) / 60, rules)]})`} value={`${hours(sum(dayLogs))} / ${rules.hoursPerDay}`} />
        <KpiCard label={`Minggu ke-${isoWeek(date)} (${STATUS_LABEL[weeklyStatus(sum(weekLogs) / 60, rules)]})`} value={`${hours(sum(weekLogs))} / ${rules.hoursPerDay * 5}`} />
        <KpiCard label={`Bulan ini (${STATUS_LABEL[summary.status]})`} value={`${summary.totalHours.toLocaleString('id-ID')} / ${summary.targetHours}`} />
        <KpiCard label="Efektivitas bulan ini" value={`${summary.effectiveness.toLocaleString('id-ID')}%`} />
      </div>

      <section className="mt-6 rounded-2xl bg-white p-5 shadow dark:bg-zinc-900">
        <h2 className="mb-3 text-lg font-bold">{editing ? 'Ubah aktivitas' : 'Catat aktivitas'}</h2>
        <WorkLogForm
          // Jangan ikutkan jumlah entri di key: remount menghapus pesan sukses.
          // Saran jam mulai baru tetap masuk lewat reset() ke defaultValue terbaru.
          key={`${date}-${editing?.id ?? 'baru'}`}
          date={date}
          name={profile.full_name ?? profile.email}
          division={(ownProfile.data as { division: string | null } | null)?.division ?? null}
          // Pilihan Proyek hanya dari Master Reference (masukan HR 20 Nov 2026); nama yang sama
          // dengan project TMS tetap tertaut ke project itu saat disimpan (app/actions/tracker.ts).
          projects={active('INTERNAL_PROJECT')}
          categories={active('ACTIVITY_CATEGORY')}
          locations={active('WORK_LOCATION')}
          suggestedStart={suggestStart(dayLogs.map((l) => ({ start: l.start_time, end: l.end_time })))}
          editing={editing}
        />
      </section>

      <section className="mt-6 rounded-2xl bg-white p-5 shadow dark:bg-zinc-900">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold">Aktivitas {formatDate(date)}</h2>
          <nav aria-label="Pilih tanggal" className="flex gap-3 text-sm font-semibold">
            <Link href={`/tracker?tanggal=${addDays(date, -1)}&${pq}`} className="text-kasuat-deep-gold hover:underline">Hari sebelumnya</Link>
            {date < today && (
              <Link href={`/tracker?tanggal=${addDays(date, 1)}&${pq}`} className="text-kasuat-deep-gold hover:underline">Hari berikutnya</Link>
            )}
          </nav>
        </div>
        {dayLogs.length === 0 ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">Belum ada aktivitas di tanggal ini.</p>
        ) : (
          <div className="relative overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-zinc-600 dark:text-zinc-400">
                  <th className="py-2 pr-3">Jam</th>
                  <th className="py-2 pr-3">Proyek</th>
                  <th className="py-2 pr-3">Aktivitas</th>
                  <th className="py-2 pr-3">Lokasi</th>
                  <th className="py-2 pr-3">Kategori Aktivitas</th>
                  <th className="py-2 pr-3">Output/Deliverables</th>
                  <th className="py-2"><span className="sr-only">Tindakan</span></th>
                </tr>
              </thead>
              <tbody>
                {dayLogs.map((l) => (
                  <tr key={l.id} className="border-b align-top last:border-0">
                    <td className="py-2 pr-3 whitespace-nowrap">{l.start_time.slice(0, 5)}–{l.end_time.slice(0, 5)} ({hours(l.duration_minutes)} j)</td>
                    <td className="py-2 pr-3">{l.project}</td>
                    <td className="py-2 pr-3">{l.activity}<CommentThread comments={comments.get(l.id) ?? []} /></td>
                    <td className="py-2 pr-3">{l.location}</td>
                    <td className="py-2 pr-3">{l.category}</td>
                    <td className="py-2 pr-3">{l.output || <span className="font-semibold text-red-700">Kosong</span>}</td>
                    <td className="py-2 whitespace-nowrap">
                      <Link href={`/tracker?tanggal=${date}&ubah=${l.id}&${pq}`} className="inline-block min-h-[44px] px-2 py-3 text-sm font-semibold text-kasuat-deep-gold hover:underline">Ubah</Link>
                      <DeleteWorkLogButton id={l.id} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section className="mt-6 rounded-2xl bg-white p-5 shadow dark:bg-zinc-900">
        <h2 className="text-lg font-bold">Rekap periode</h2>
        <PeriodFilter period={period} error={periodError} base="/tracker" keep={{ tanggal: date }} />
        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard label={`Total jam (${STATUS_LABEL[periodSum.status]})`} value={`${periodSum.totalHours.toLocaleString('id-ID')} / ${periodSum.targetHours}`} />
          <KpiCard label="Efektivitas" value={`${periodSum.effectiveness.toLocaleString('id-ID')}%`} />
          <KpiCard label="Hari aktif" value={`${periodSum.activeDays} / ${periodBasis.workdays.length}`} />
          <KpiCard label="Aktivitas" value={String(periodSum.activities)} />
        </div>
        {/* Tanpa "Jam per klien": sheet tidak punya, dan klien project menu Project berisi nama kontak (masukan HR 20 Nov 2026). */}
        <div className="mt-4 grid gap-6 lg:grid-cols-2">
          <BreakdownTable title="Jam per proyek" keyLabel="Proyek" rows={breakdown(periodLogs, 'project_name')} />
          <BreakdownTable title="Jam per kategori" keyLabel="Kategori" rows={breakdown(periodLogs, 'category')} />
        </div>
      </section>
    </AppShell>
  )
}
