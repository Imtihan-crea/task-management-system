import Link from 'next/link'
import { requirePermission } from '@/lib/auth/current-access'
import { createAdminClient } from '@/lib/supabase/admin'
import { AppShell } from '@/components/layout/AppShell'
import { PageHeader } from '@/components/ui/primitives'
import { CalendarAddForm, CalendarRemoveButton, HolidayImportButton, MonthTargetForm, RulesForm } from '@/components/hr/HrSettingsForms'
import { loadRules } from '@/lib/hr/data'
import { monthRange, workingDays } from '@/lib/hr/tracker'
import { formatDate, todayISO } from '@/lib/utils/dates'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']

/** Pengaturan HR: aturan jam berversi, kalender libur, target bulanan dikunci. Izin hr.manage. */
export default async function HrSettingsPage({ searchParams }: { searchParams: Promise<{ tahun?: string }> }) {
  await requirePermission('hr.manage')
  const sp = await searchParams
  const today = todayISO()
  const year = /^\d{4}$/.test(sp.tahun ?? '') ? sp.tahun! : today.slice(0, 4)
  const admin = createAdminClient()
  const [rules, calendarRes, versionsRes, targetsRes] = await Promise.all([
    loadRules(today),
    admin.from('work_calendar').select('day, kind, name').gte('day', `${year}-01-01`).lte('day', `${year}-12-31`).order('day'),
    admin.from('hr_settings').select('effective_from, created_at').order('effective_from', { ascending: false }),
    admin.from('hr_month_targets').select('month, target_hours, note').gte('month', `${year}-01-01`).lte('month', `${year}-12-01`),
  ])
  const calendarRows = (calendarRes.data ?? []) as { day: string; kind: 'HOLIDAY' | 'WORKDAY'; name: string }[]
  const calendar = calendarRows
  const targets = new Map(((targetsRes.data ?? []) as { month: string; target_hours: number | string; note: string | null }[]).map((t) => [t.month.slice(0, 7), t]))
  const versions = (versionsRes.data ?? []) as { effective_from: string }[]

  return (
    <AppShell>
      <PageHeader
        title="Pengaturan HR"
        subtitle="Aturan jam kerja, kalender libur, dan target jam bulanan untuk Daily Tracker."
        actions={<Link href="/master-reference" className="text-sm font-semibold text-kasuat-deep-gold hover:underline">Daftar pilihan (Master Reference)</Link>}
      />

      <section className="mt-6 rounded-2xl bg-white p-5 shadow dark:bg-zinc-900">
        <h2 className="text-lg font-bold">Aturan jam kerja</h2>
        <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-400">
          Perubahan disimpan sebagai versi baru mulai tanggal berlaku; rekap bulan lama tetap memakai aturan versinya.
          {versions.length ? ` Versi tersimpan: ${versions.map((v) => formatDate(v.effective_from)).join(', ')}.` : ' Belum ada versi tersimpan; yang berlaku adalah nilai draft KPI.'}
        </p>
        <RulesForm rules={rules} today={today} />
      </section>

      <section className="mt-6 rounded-2xl bg-white p-5 shadow dark:bg-zinc-900">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold">Kalender kerja {year}</h2>
          <nav aria-label="Pilih tahun" className="flex gap-3 text-sm font-semibold">
            <Link href={`/settings/hr?tahun=${Number(year) - 1}`} className="text-kasuat-deep-gold hover:underline">{Number(year) - 1}</Link>
            <Link href={`/settings/hr?tahun=${Number(year) + 1}`} className="text-kasuat-deep-gold hover:underline">{Number(year) + 1}</Link>
          </nav>
        </div>
        <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-400">Hari kerja = Senin–Jumat, dikurangi libur, ditambah hari kerja pengganti.</p>
        <HolidayImportButton year={year} />
        <CalendarAddForm />
        {calendarRows.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">Belum ada libur tercatat untuk {year}.</p>
        ) : (
          <table className="mt-4 w-full text-sm">
            <thead>
              <tr className="border-b text-left text-zinc-600 dark:text-zinc-400">
                <th className="py-2 pr-3">Tanggal</th>
                <th className="py-2 pr-3">Jenis</th>
                <th className="py-2 pr-3">Keterangan</th>
                <th className="py-2"><span className="sr-only">Tindakan</span></th>
              </tr>
            </thead>
            <tbody>
              {calendarRows.map((c) => (
                <tr key={c.day} className="border-b last:border-0">
                  <td className="py-2 pr-3 whitespace-nowrap">{formatDate(c.day)}</td>
                  <td className="py-2 pr-3">{c.kind === 'HOLIDAY' ? 'Libur' : 'Hari kerja pengganti'}</td>
                  <td className="py-2 pr-3">{c.name}</td>
                  <td className="py-2"><CalendarRemoveButton day={c.day} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="mt-6 rounded-2xl bg-white p-5 shadow dark:bg-zinc-900">
        <h2 className="text-lg font-bold">Target jam bulanan {year}</h2>
        <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-400">Otomatis = hari kerja × {rules.hoursPerDay} jam. Kunci manual bila ada penyesuaian khusus.</p>
        <div className="relative overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-zinc-600 dark:text-zinc-400">
                <th className="py-2 pr-3">Bulan</th>
                <th className="py-2 pr-3 text-right">Hari kerja</th>
                <th className="py-2 pr-3 text-right">Target</th>
                <th className="py-2">Catatan</th>
              </tr>
            </thead>
            <tbody>
              {MONTHS.map((name, i) => {
                const month = `${year}-${String(i + 1).padStart(2, '0')}`
                const [from, to] = monthRange(month)
                const days = workingDays(from, to, calendar).length
                const locked = targets.get(month)
                return (
                  <tr key={month} className="border-b last:border-0">
                    <td className="py-2 pr-3">{name} {year}</td>
                    <td className="py-2 pr-3 text-right">{days}</td>
                    <td className="py-2 pr-3 text-right">{locked ? `${Number(locked.target_hours)} (dikunci)` : days * rules.hoursPerDay}</td>
                    <td className="py-2">{locked?.note ?? ''}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="mt-4">
          <MonthTargetForm month={today.slice(0, 7)} />
        </div>
      </section>
    </AppShell>
  )
}
