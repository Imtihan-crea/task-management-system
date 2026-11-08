import Link from 'next/link'
import { can } from '@/lib/auth/permissions'
import type { UserRole } from '@/types/profile'
import { MeetingStatusBadge, MeetingTypeBadge } from '@/components/meetings/MeetingBadges'
import { EmptyState } from '@/components/ui/primitives'
import {
  fetchMeetingProjects,
  fetchMeetings,
  type MeetingFilters,
  type MeetingRow,
  type MeetingScope,
} from '@/lib/data/meetings'
import { matchesMeetingSearch, matchesMeetingTab } from '@/lib/meetings/rules'
import {
  daysAgoLabel,
  formatMeetingDate,
  formatRelativeDay,
  formatTimeRange,
} from '@/lib/utils/meeting-time'

/**
 * Daftar meeting (§9): kartu di mobile, tabel di desktop.
 * Dijalankan dalam Suspense boundary — hanya area ini yang loading.
 * Tab & search diterapkan di memori dari dataset yang sama dengan Tabs/KPI.
 */
export async function MeetingResults({
  scope,
  filters,
}: {
  scope: MeetingScope
  filters: MeetingFilters
}) {
  const [rows, projects] = await Promise.all([
    fetchMeetings(scope, filters),
    fetchMeetingProjects(),
  ])

  const projectNames = Object.fromEntries(projects.map((p) => [p.id, `${p.code} · ${p.name}`]))

  const now = new Date()
  const visible = rows.filter(
    (r) => matchesMeetingTab(r, filters.tab, now) && matchesMeetingSearch(r, filters.q)
  )

  if (visible.length === 0) {
    const emptyMessage =
      filters.tab === 'needs_notes'
        ? 'Semua sudah beres. Tidak ada Meeting yang perlu Notes.'
        : filters.tab === 'today'
          ? 'Tidak ada Meeting hari ini.'
          : 'Coba pencarian, tab, atau filter lain.'
    return (
      <div className="mt-4">
        <EmptyState
          title="Meeting tidak ditemukan."
          message={emptyMessage}
          // Hanya untuk role yang boleh membuat meeting (VIEWER tidak; temuan e2e:rbac).
          action={
            can(scope.role as UserRole, 'meetings.create') ? (
              <Link href="/meetings/new" className="font-semibold text-kasuat-deep-gold hover:underline">+ Buat Meeting</Link>
            ) : undefined
          }
        />
      </div>
    )
  }

  return (
    <>
      <p className="mt-3 text-sm text-zinc-500" role="status">
        {visible.length} meeting
      </p>

      {/* Desktop: tabel */}
      <div className="mt-3 hidden overflow-x-auto rounded-2xl bg-white shadow md:block dark:bg-zinc-900">
        <table className="w-full text-left text-sm">
          <thead className="border-b text-xs uppercase text-zinc-500">
            <tr>
              <th scope="col" className="px-4 py-3">ID</th>
              <th scope="col" className="px-4 py-3">Meeting</th>
              <th scope="col" className="px-4 py-3">Project</th>
              <th scope="col" className="px-4 py-3">Jadwal</th>
              <th scope="col" className="px-4 py-3">Status</th>
              <th scope="col" className="px-4 py-3">Item / Task</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((m) => (
              <MeetingTableRow key={m.id} meeting={m} projectName={projectNames[m.project_id ?? ''] ?? 'Global'} />
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile: kartu */}
      <ul className="mt-4 flex flex-col gap-3 md:hidden">
        {visible.map((m) => (
          <MeetingCard key={m.id} meeting={m} projectName={projectNames[m.project_id ?? ''] ?? 'Global'} />
        ))}
      </ul>
    </>
  )
}

function MeetingTableRow({
  meeting: m,
  projectName,
}: {
  meeting: MeetingRow
  projectName: string
}) {
  return (
    <tr className="border-b last:border-0">
      <td className="px-4 py-3 font-mono text-xs">{m.code}</td>
      <td className="px-4 py-3">
        <Link href={`/meetings/${m.id}`} className="font-medium hover:underline">
          {m.title}
        </Link>
        <p className="mt-0.5 text-xs text-zinc-500">
          {m.participant_count} peserta
        </p>
      </td>
      <td className="px-4 py-3">{projectName}</td>
      <td className="px-4 py-3 whitespace-nowrap">
        {formatMeetingDate(m.meeting_date)}
        <span className="block text-xs text-zinc-500">{formatTimeRange(m.start_time, m.end_time)}</span>
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-wrap gap-1">
          <MeetingStatusBadge status={m.status} />
          <MeetingTypeBadge type={m.meeting_type} />
        </div>
      </td>
      <td className="px-4 py-3 whitespace-nowrap">
        {m.action_item_count} item · {m.task_count} task
      </td>
    </tr>
  )
}

function MeetingCard({
  meeting: m,
  projectName,
}: {
  meeting: MeetingRow
  projectName: string
}) {
  return (
    <li>
      <Link
        href={`/meetings/${m.id}`}
        className="block rounded-2xl bg-white p-4 shadow dark:bg-zinc-900"
      >
        <p className="font-semibold">
          <span className="mr-2 rounded-md bg-zinc-100 px-1.5 py-0.5 font-mono text-xs dark:bg-zinc-800">
            {m.code}
          </span>
          {m.title}
        </p>
        <p className="mt-0.5 truncate text-sm text-zinc-500">
          {projectName} · {formatRelativeDay(m.meeting_date)} ·{' '}
          {formatTimeRange(m.start_time, m.end_time)}
        </p>
        <p className="mt-0.5 text-xs text-zinc-500">
          {m.participant_count} peserta · {m.action_item_count} Action Item ·{' '}
          {m.task_count} task · {daysAgoLabel(m.meeting_date)}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <MeetingStatusBadge status={m.status} />
          <MeetingTypeBadge type={m.meeting_type} />
        </div>
      </Link>
    </li>
  )
}