import { fetchTaskLookups } from '@/lib/data/task-list'
import { DebouncedTaskSearch } from '@/components/tasks/TaskSearch'
import type { TaskTabKey } from '@/components/tasks/TaskTabs'

const SORT_OPTIONS = [
  { value: 'deadline.asc', label: 'Deadline (terdekat, belum selesai dulu)' },
  { value: 'deadline.desc', label: 'Deadline (terjauh, belum selesai dulu)' },
  { value: 'priority', label: 'Prioritas (HIGH dulu)' },
  { value: 'created_at.desc', label: 'Dibuat (terbaru)' },
  { value: 'updated_at.desc', label: 'Diperbarui (terbaru)' },
]

export type TaskFilterState = {
  q: string
  tab: TaskTabKey
  project: string
  workstream: string
  status: string
  priority: string
  deadline: string
  sort: string
}

/**
 * Form filter /tasks. Dipisah dari page + dibungkus Suspense supaya:
 * - header & tab langsung tampil tanpa menunggu query
 * - lookup projects/workstreams dipakai ulang dari cache() yang sama
 *   dengan TaskResults (sebelumnya 3 query diulang di page).
 */
export async function TaskFilterForm({ state }: { state: TaskFilterState }) {
  const lookups = await fetchTaskLookups()

  return (
    <form
      method="get"
      className="mt-4 flex flex-col gap-3 rounded-2xl bg-white p-4 shadow dark:bg-zinc-900"
    >
      {state.tab !== 'all' && (
        <input type="hidden" name="view" value={state.tab === 'mine' ? 'mine' : state.tab} />
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="sm:col-span-2 lg:col-span-1">
          <DebouncedTaskSearch key={state.q} initial={state.q} />
        </div>
        <div>
          <label htmlFor="project" className="mb-1 block text-sm font-medium">
            Project
          </label>
          <select
            id="project"
            name="project"
            defaultValue={state.project}
            className="min-h-[44px] w-full rounded-lg border px-3 py-2 text-base dark:border-zinc-700 dark:bg-zinc-800"
          >
            <option value="">Semua</option>
            {lookups.projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code} · {p.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="workstream" className="mb-1 block text-sm font-medium">
            Workstream
          </label>
          <select
            id="workstream"
            name="workstream"
            defaultValue={state.workstream}
            className="min-h-[44px] w-full rounded-lg border px-3 py-2 text-base dark:border-zinc-700 dark:bg-zinc-800"
          >
            <option value="">Semua</option>
            {lookups.workstreams
              .filter((w) => !state.project || w.project_id === state.project)
              .map((w) => (
                <option key={w.id} value={w.id}>
                  {w.code} · {w.name}
                </option>
              ))}
          </select>
        </div>
        <div>
          <label htmlFor="status" className="mb-1 block text-sm font-medium">
            Status
          </label>
          <select
            id="status"
            name="status"
            defaultValue={state.status}
            className="min-h-[44px] w-full rounded-lg border px-3 py-2 text-base dark:border-zinc-700 dark:bg-zinc-800"
          >
            <option value="">Semua</option>
            {(['TODO', 'IN_PROGRESS', 'REVIEW', 'BLOCKED', 'DONE', 'CANCELLED'] as const).map((s) => (
              <option key={s} value={s}>
                {s.replace('_', ' ')}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="priority" className="mb-1 block text-sm font-medium">
            Prioritas
          </label>
          <select
            id="priority"
            name="priority"
            defaultValue={state.priority}
            className="min-h-[44px] w-full rounded-lg border px-3 py-2 text-base dark:border-zinc-700 dark:bg-zinc-800"
          >
            <option value="">Semua</option>
            {(['LOW', 'MEDIUM', 'HIGH'] as const).map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="deadline" className="mb-1 block text-sm font-medium">
            Deadline
          </label>
          <select
            id="deadline"
            name="deadline"
            defaultValue={state.deadline}
            className="min-h-[44px] w-full rounded-lg border px-3 py-2 text-base dark:border-zinc-700 dark:bg-zinc-800"
          >
            <option value="">Semua</option>
            <option value="overdue">Overdue</option>
            <option value="week">Jatuh tempo minggu ini</option>
          </select>
        </div>
        <div>
          <label htmlFor="sort" className="mb-1 block text-sm font-medium">
            Urutkan
          </label>
          <select
            id="sort"
            name="sort"
            defaultValue={state.sort}
            className="min-h-[44px] w-full rounded-lg border px-3 py-2 text-base dark:border-zinc-700 dark:bg-zinc-800"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <button
        type="submit"
        className="min-h-[44px] rounded-lg bg-kasuat-gold px-5 py-2 font-semibold text-kasuat-black sm:w-auto"
      >
        Terapkan
      </button>
    </form>
  )
}