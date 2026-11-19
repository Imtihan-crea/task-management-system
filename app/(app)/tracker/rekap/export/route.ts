import type { NextRequest } from 'next/server'
import { requirePermission } from '@/lib/auth/current-access'
import { loadReviewLogs } from '@/lib/hr/data'
import { dailyDataColumns, plain, summaryColumns } from '@/lib/hr/export-columns'
import { loadRekap, parseMonth, type RekapPerson } from '@/lib/hr/rekap'
import { breakdown, type Breakdown } from '@/lib/hr/tracker'
import { exportInfo, type ExcelColumn } from '@/lib/export/excel'
import { exportResponse } from '@/lib/export'

export const dynamic = 'force-dynamic'

type PersonBreakdown = Breakdown & { person: RekapPerson }

const name = (p: { full_name: string | null; email: string }) => p.full_name || p.email

const breakdownColumns = (keyLabel: string): ExcelColumn<PersonBreakdown>[] => [
  { header: 'Nama', width: 22, value: (r) => name(r.person) },
  { header: 'Divisi', width: 14, value: (r) => r.person.division },
  { header: keyLabel, width: 28, value: (r) => plain(r.key) },
  { header: 'Jam', width: 9, format: '0.00', value: (r) => r.hours },
  { header: 'Jumlah Aktivitas', width: 10, value: (r) => r.count },
  { header: '% dari Jam Orang Ini', width: 12, format: '0.00', value: (r) => r.percent },
]

/** Rekap Daily Tracker -> Excel (Monthly Summary, Daily Data, Jam per Proyek, Jam per Kategori). Izin hr.view. */
export async function GET(request: NextRequest) {
  const viewer = await requirePermission('hr.view')
  const sp = request.nextUrl.searchParams
  const month = parseMonth(sp.get('bulan'))
  const divisi = sp.get('divisi') || null
  const { from, to, people, byUser, rows, basis, rules } = await loadRekap(month, divisi)

  const ids = new Set(people.map((p) => p.id))
  const divisionOf = new Map(people.map((p) => [p.id, p.division]))
  const activities = (await loadReviewLogs({ from, to }))
    .filter((l) => ids.has(l.user_id))
    .sort((a, b) => a.work_date.localeCompare(b.work_date) || a.person.localeCompare(b.person) || a.start_time.localeCompare(b.start_time))
  const perPerson = (key: 'project_name' | 'category') =>
    people.flatMap((p) => breakdown(byUser.get(p.id) ?? [], key).map((b) => ({ ...b, person: p })))

  const target = basis.lockedTarget ?? basis.workdays.length * rules.hoursPerDay
  const info = exportInfo(name(viewer), [
    `Bulan: ${month} · Divisi: ${divisi ?? 'Semua'}`,
    `Hari kerja ${basis.workdays.length}, target ${target} jam${basis.lockedTarget ? ' (dikunci HR)' : ''}`,
  ])

  const title = (t: string) => `${t} ${month}${divisi ? ` - ${divisi}` : ''}`
  return exportResponse(request, `Rekap Daily Tracker ${month}${divisi ? ` ${divisi}` : ''}`, [
    { name: 'Monthly Summary', title: title('MONTHLY SUMMARY'), info, columns: summaryColumns, rows },
    { name: 'Daily Data', title: title('DAILY DATA'), info, columns: dailyDataColumns((id) => divisionOf.get(id) ?? null), rows: activities },
    { name: 'Jam per Proyek', title: title('JAM PER PROYEK'), info, columns: breakdownColumns('Proyek'), rows: perPerson('project_name') },
    { name: 'Jam per Kategori', title: title('JAM PER KATEGORI'), info, columns: breakdownColumns('Kategori Aktifitas'), rows: perPerson('category') },
  ])
}
