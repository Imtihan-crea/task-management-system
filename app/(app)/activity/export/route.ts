import type { NextRequest } from 'next/server'
import { requireProfile } from '@/lib/auth/session'
import { activityPager, parseActivityFilters } from '@/lib/data/activity-list'
import { describeActivity, resolveActorNames, type ActivityEntry } from '@/components/activity/ActivityTimeline'
import { exportInfo, type ExcelColumn } from '@/lib/export/excel'
import { exportResponse } from '@/lib/export'
import { allRows } from '@/lib/utils/paginate'
import { todayISO } from '@/lib/utils/dates'
import { onlySelected, selectedIds } from '@/lib/bulk'

export const dynamic = 'force-dynamic'

/** Activity Log -> Excel. Query pakai USER client (RLS) dan filter yang sama dengan halaman /activity, tanpa paginasi. */
export async function GET(request: NextRequest) {
  const profile = await requireProfile()
  const sp = request.nextUrl.searchParams
  const filters = parseActivityFilters((k) => sp.get(k) ?? '')
  const pager = await activityPager(filters)
  const picked = selectedIds(sp)
  // shortcut: export terpilih tetap membaca semua entri sesuai filter lalu menyaring; cukup selama log < puluhan ribu baris.
  const entries = onlySelected(await allRows<ActivityEntry>(pager), picked, (e) => String(e.id))
  const actorNames = await resolveActorNames(entries)

  const columns: ExcelColumn<ActivityEntry>[] = [
    { header: 'Waktu (WIB)', width: 18, value: (e) => new Date(e.created_at).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'medium', timeStyle: 'short' }) },
    { header: 'Pelaku', width: 24, value: (e) => (e.actor_user_id ? (actorNames[e.actor_user_id] ?? 'User tidak dikenal') : 'Sistem') },
    { header: 'Entitas', width: 18, value: (e) => e.entity_type },
    { header: 'Kode', width: 12, value: (e) => e.entity_code },
    { header: 'Aksi', width: 30, value: (e) => e.action.replace(/_/g, ' ') },
    { header: 'Keterangan', width: 56, value: (e) => describeActivity(e) },
  ]
  const f = [
    picked && 'Hanya baris terpilih',
    filters.entity && `Entitas: ${filters.entity}`,
    filters.action && `Aksi: ${filters.action.replace(/_/g, ' ')}`,
    filters.actor && `Pelaku: ${filters.actor}`,
    filters.from && `Dari: ${filters.from}`,
    filters.to && `Sampai: ${filters.to}`,
  ].filter(Boolean)
  const info = exportInfo(profile.full_name || profile.email, [`${entries.length} entri`, ...(f.length ? [f.join(' · ')] : [])])
  return exportResponse(request, `Activity Log ${todayISO()}`, [{ name: 'Activity', title: 'ACTIVITY LOG', info, columns, rows: entries }])
}
