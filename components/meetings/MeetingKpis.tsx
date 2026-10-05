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
        <KpiCard label="Upcoming Meetings" value={kpis.upcoming} />
        <KpiCard label="Today's Meetings" value={kpis.today} />
        <KpiCard label="Needs Notes" value={kpis.needsNotes} />
        <KpiCard label="Completed This Week" value={kpis.completedThisWeek} />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard label="Open Action Items" value={kpis.openActionItems} />
        <KpiCard label="Tasks Created This Month" value={kpis.tasksCreatedThisMonth} />
      </div>
    </>
  )
}