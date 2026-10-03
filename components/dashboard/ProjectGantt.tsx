import Link from 'next/link'
import { requireProfile } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'

type GanttProject = {
  id: string
  code: string
  name: string
  status: string
  start_date: string | null
  end_date: string | null
  progress: number
}

function toDay(s: string): number {
  const [y, m, d] = s.split('-').map(Number)
  return Date.UTC(y, m - 1, d) / 86400000
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']

function monthLabel(dayNum: number): string {
  const d = new Date(dayNum * 86400000)
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

/**
 * Global Project Gantt (§16–18). Satu timeline untuk semua project
 * dalam scope role. Data: tanggal + progress existing (tanpa source kedua).
 * Month view (8 minggu) / Week view (14 hari), today marker, klik → detail.
 */
export async function ProjectGantt({
  view,
  offset,
}: {
  view: 'month' | 'week'
  offset: number
}) {
  const profile = await requireProfile()
  const admin = createAdminClient()
  const role = profile.role

  let projectIds: string[] | null = null
  if (role === 'PROJECT_MANAGER') {
    const { data: links } = await admin
      .from('project_managers')
      .select('project_id')
      .eq('user_id', profile.id)
    projectIds = ((links ?? []) as { project_id: string }[]).map((l) => l.project_id)
  } else if (role === 'TEAM_MEMBER') {
    const { data: myTasks } = await admin
      .from('tasks')
      .select('project_id')
      .eq('assignee_id', profile.id)
      .eq('is_deleted', false)
      .limit(1000)
    projectIds = [
      ...new Set(((myTasks ?? []) as { project_id: string }[]).map((t) => t.project_id)),
    ]
  }

  let projectsQuery = admin
    .from('projects')
    .select('id, code, name, status, start_date, end_date')
    .order('start_date', { ascending: true, nullsFirst: false })
    .limit(200)
  if (projectIds !== null) {
    projectsQuery =
      projectIds.length > 0
        ? projectsQuery.in('id', projectIds)
        : projectsQuery.eq('id', '00000000-0000-0000-0000-000000000000')
  }

  const [{ data: projectsData }, { data: tasksData }] = await Promise.all([
    projectsQuery,
    (async () => {
      let q = admin
        .from('tasks')
        .select('project_id, status')
        .eq('is_deleted', false)
        .limit(3000)
      if (projectIds !== null) {
        q =
          projectIds.length > 0
            ? q.in('project_id', projectIds)
            : q.eq('project_id', '00000000-0000-0000-0000-000000000000')
      }
      return q
    })(),
  ])

  const projects = ((projectsData ?? []) as (GanttProject & {
    start_date: string | null
    end_date: string | null
  })[]).filter((p) => p.start_date && p.end_date)

  const tasks = (tasksData ?? []) as { project_id: string; status: string }[]
  const withProgress: GanttProject[] = projects.map((p) => {
    const pt = tasks.filter((t) => t.project_id === p.id)
    const done = pt.filter((t) => t.status === 'DONE').length
    return {
      ...p,
      progress: pt.length === 0 ? 0 : Math.round((done / pt.length) * 100),
    }
  })

  // Window waktu.
  const today = toDay(new Date().toISOString().slice(0, 10))
  let winStart = today
  let cols: { key: string; label: string; start: number; end: number }[]
  if (view === 'week') {
    const monday = today - ((new Date(today * 86400000).getUTCDay() + 6) % 7) + offset * 14
    cols = Array.from({ length: 14 }, (_, i) => {
      const d = monday + i
      return {
        key: String(d),
        label: new Date(d * 86400000).getUTCDate().toString(),
        start: d,
        end: d + 1,
      }
    })
    winStart = monday
  } else {
    // 8 minggu mulai Senin minggu berjalan + offset bulan (~4 minggu).
    const monday = today - ((new Date(today * 86400000).getUTCDay() + 6) % 7) + offset * 28
    cols = Array.from({ length: 8 }, (_, i) => {
      const d = monday + i * 7
      return { key: String(d), label: `M${i + 1}`, start: d, end: d + 7 }
    })
    winStart = monday
  }
  void winStart
  const winEnd = cols[cols.length - 1].end
  const winSpan = winEnd - cols[0].start

  const visible = withProgress.filter((p) => {
    const s = toDay(p.start_date!)
    const e = toDay(p.end_date!)
    return e >= cols[0].start && s < winEnd
  })

  const baseParams = (o: number, v: 'month' | 'week') => `/dashboard?gantt=${v}&goffset=${o}`

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex gap-1" role="tablist" aria-label="Gantt view">
          {(['month', 'week'] as const).map((v) => (
            <Link
              key={v}
              href={baseParams(offset, v)}
              role="tab"
              aria-selected={view === v}
              className={`inline-flex min-h-[36px] items-center rounded-lg px-3 py-1 text-sm font-medium ${
                view === v
                  ? 'bg-kasuat-gold text-kasuat-black'
                  : 'border border-zinc-300 dark:border-zinc-700'
              }`}
            >
              {v === 'month' ? 'Bulan' : 'Minggu'}
            </Link>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-1">
          <Link
            href={baseParams(offset - 1, view)}
            aria-label="Previous period"
            className="inline-flex min-h-[36px] min-w-[36px] items-center justify-center rounded-lg border border-zinc-300 dark:border-zinc-700"
          >
            ‹
          </Link>
          <Link
            href={baseParams(0, view)}
            className="inline-flex min-h-[36px] items-center rounded-lg border border-zinc-300 px-3 text-sm font-semibold dark:border-zinc-700"
          >
            Hari Ini
          </Link>
          <Link
            href={baseParams(offset + 1, view)}
            aria-label="Next period"
            className="inline-flex min-h-[36px] min-w-[36px] items-center justify-center rounded-lg border border-zinc-300 dark:border-zinc-700"
          >
            ›
          </Link>
        </div>
      </div>

      <p className="mb-2 text-center text-sm font-semibold">{monthLabel(cols[0].start)}</p>

      {visible.length === 0 ? (
        <p className="text-sm text-zinc-500">No projects with dates in this period.</p>
      ) : (
        <div className="overflow-x-auto">
          <div className="min-w-[560px]">
            <div
              className="grid gap-1"
              style={{ gridTemplateColumns: `180px repeat(${cols.length}, minmax(36px, 1fr))` }}
            >
              <div className="px-1 py-1 text-xs font-semibold text-zinc-500">Project</div>
              {cols.map((c) => (
                <div key={c.key} className="px-1 py-1 text-center text-xs text-zinc-500">
                  {c.label}
                </div>
              ))}
              {visible.map((p) => {
                const s = toDay(p.start_date!)
                const e = toDay(p.end_date!)
                const leftPct = Math.max(0, ((s - cols[0].start) / winSpan) * 100)
                const rightPct = Math.min(100, ((e - cols[0].start) / winSpan) * 100)
                const widthPct = Math.max(2, rightPct - leftPct)
                const todayPct =
                  today >= cols[0].start && today < winEnd
                    ? ((today - cols[0].start) / winSpan) * 100
                    : null
                return (
                  <div key={p.id} className="contents">
                    <Link
                      href={`/projects/${p.id}`}
                      className="truncate px-1 py-1.5 text-xs font-medium hover:underline"
                      title={`${p.code} · ${p.name}`}
                    >
                      <span className="mr-1 font-mono text-[11px] text-zinc-500">{p.code}</span>
                      {p.name}
                    </Link>
                    <div className="relative" style={{ gridColumn: `2 / span ${cols.length}` }}>
                      <div className="relative h-6 rounded-full bg-zinc-100 dark:bg-zinc-800">
                        <div
                          className="absolute top-0 h-6 overflow-hidden rounded-full bg-kasuat-light-gold"
                          style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                          title={`${p.code} · ${p.progress}%`}
                        >
                          <div
                            className="h-6 rounded-full bg-kasuat-gold"
                            style={{ width: `${p.progress}%` }}
                          />
                        </div>
                        {todayPct !== null && (
                          <div
                            aria-hidden="true"
                            className="absolute top-[-4px] h-[32px] w-0.5 bg-red-500"
                            style={{ left: `${todayPct}%` }}
                            title="Hari ini"
                          />
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
