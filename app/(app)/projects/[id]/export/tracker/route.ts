import { notFound } from 'next/navigation'
import type { NextRequest } from 'next/server'
import { requireProfile } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { hasPermission } from '@/lib/auth/current-access'
import { loadReviewLogs } from '@/lib/hr/data'
import { dailyDataColumns } from '@/lib/hr/export-columns'
import { parseMonth } from '@/lib/hr/rekap'
import { breakdown, monthRange } from '@/lib/hr/tracker'
import { excelResponse, exportInfo } from '@/lib/export/excel'

export const dynamic = 'force-dynamic'

/** Tab Daily Tracker project (?bulan=YYYY-MM). Izin tracker.review di project ini atau hr.view (sama dengan tab-nya). */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const profile = await requireProfile()
  const { id } = await params
  const [canReview, canViewHr] = await Promise.all([
    hasPermission(profile.id, 'tracker.review', id),
    hasPermission(profile.id, 'hr.view'),
  ])
  if (!canReview && !canViewHr) notFound()

  const admin = createAdminClient()
  const { data: project } = await admin.from('projects').select('code, name').eq('id', id).single<{ code: string; name: string }>()
  if (!project) notFound()

  const month = parseMonth(request.nextUrl.searchParams.get('bulan'))
  const [from, to] = monthRange(month)
  const logs = await loadReviewLogs({ projectId: id, from, to })
  const userIds = [...new Set(logs.map((l) => l.user_id))]
  const { data: people } = userIds.length ? await admin.from('profiles').select('id, division').in('id', userIds) : { data: [] }
  const divisionOf = new Map(((people ?? []) as { id: string; division: string | null }[]).map((p) => [p.id, p.division]))
  const sorted = [...logs].sort((a, b) => a.work_date.localeCompare(b.work_date) || a.person.localeCompare(b.person) || a.start_time.localeCompare(b.start_time))
  const perPerson = breakdown(
    logs.map((l) => ({ user_id: l.user_id, work_date: l.work_date, project_name: l.person, category: l.category, duration_minutes: l.duration_minutes })),
    'project_name'
  )

  const label = `${project.code} - ${project.name}`
  const info = exportInfo(profile.full_name || profile.email, [`Proyek: ${label} · Bulan: ${month}`])
  return excelResponse(`Daily Tracker ${project.name} ${month}`, [
    { name: 'Daily Data', title: `DAILY DATA ${project.name.toUpperCase()} ${month}`, info, columns: dailyDataColumns((uid) => divisionOf.get(uid) ?? null), rows: sorted },
    {
      name: 'Jam per Orang',
      title: `JAM PER ORANG ${project.name.toUpperCase()} ${month}`,
      info,
      columns: [
        { header: 'Nama', width: 24, value: (r: (typeof perPerson)[number]) => r.key },
        { header: 'Jam', width: 9, format: '0.00', value: (r: (typeof perPerson)[number]) => r.hours },
        { header: 'Jumlah Aktivitas', width: 10, value: (r: (typeof perPerson)[number]) => r.count },
        { header: '% dari Jam Project', width: 12, format: '0.00', value: (r: (typeof perPerson)[number]) => r.percent },
      ],
      rows: perPerson,
    },
  ])
}
