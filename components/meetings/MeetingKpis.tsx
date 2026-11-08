import { fetchMeetingKpis, type MeetingFilters, type MeetingScope } from '@/lib/data/meetings'
import { KpiCard } from '@/components/ui/primitives'

/**
 * KPI Meeting Dashboard (§6): 4 utama + 2 opsional.
 * Mengikuti role/scope user (data yang sama dengan daftar).
 */
export async function MeetingKpis({
  scope,
  filters,
}: {
  scope: MeetingScope
  filters: MeetingFilters
}) {
  const kpis = await fetchMeetingKpis(scope, filters)

  return (
    <>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard label="Meeting Mendatang" value={kpis.upcoming} />
        <KpiCard label="Meeting Hari Ini" value={kpis.today} />
        <KpiCard label="Perlu Notes" value={kpis.needsNotes} />
        <KpiCard label="Selesai Minggu Ini" value={kpis.completedThisWeek} />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard label="Action Item Terbuka" value={kpis.openActionItems} />
        <KpiCard label="Task Dibuat Bulan Ini" value={kpis.tasksCreatedThisMonth} />
      </div>
    </>
  )
}