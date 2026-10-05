import { Tabs } from '@/components/ui/Tabs'
import { fetchMeetings, type MeetingFilters, type MeetingScope } from '@/lib/data/meetings'
import { matchesMeetingTab } from '@/lib/meetings/rules'
import { MEETING_TABS, MEETING_TAB_LABELS, type MeetingTabKey } from '@/types/meeting'

/**
 * Tab Meeting Dashboard (§7) dengan counts.
 *
 * Counts dihitung dari dataset yang SAMA dengan Results & KPI
 * (fetchMeetings yang sama via cache() — 1 query untuk ketiganya).
 * Navigasi berbasis URL: refresh & Back/Forward mempertahankan state.
 */
export async function MeetingTabs({
  scope,
  tab,
  filters,
  baseParams,
}: {
  scope: MeetingScope
  tab: MeetingTabKey
  /** Semua filter (tab & q diabaikan fetchMeetings, tapi ikut cache key). */
  filters: MeetingFilters
  /** Param URL yang dipertahankan saat pindah tab (tanpa `tab`). */
  baseParams: Record<string, string>
}) {
  const rows = await fetchMeetings(scope, filters)
  const now = new Date()

  const href = (key: MeetingTabKey) => {
    const params = new URLSearchParams(baseParams)
    if (key === 'upcoming') params.delete('tab')
    else params.set('tab', key)
    const s = params.toString()
    return s ? `/meetings?${s}` : '/meetings'
  }

  return (
    <Tabs
      label="Meeting views"
      items={MEETING_TABS.map((key) => ({
        key,
        label: MEETING_TAB_LABELS[key],
        count: rows.filter((r) => matchesMeetingTab(r, key, now)).length,
        href: href(key),
        active: tab === key,
      }))}
    />
  )
}