import { fetchTaskLookups } from '@/lib/data/task-list'
import { DebouncedTaskSearch } from '@/components/tasks/TaskSearch'
import type { TaskTabKey } from '@/components/tasks/TaskTabs'
import { FIELD, FIELD_LABEL, FILTER_GRID, FilterPanel, SUBMIT } from '@/components/ui/primitives'
import { taskStatusLabel } from '@/lib/auth/roles'

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
  const active = [state.q, state.project, state.workstream, state.status, state.priority, state.deadline].filter(Boolean).length
    + (state.sort && state.sort !== 'deadline.asc' ? 1 : 0)

  return (
    <FilterPanel active={active}>
    <form method="get">
      {state.tab !== 'all' && (
        <input type="hidden" name="view" value={state.tab === 'mine' ? 'mine' : state.tab} />
      )}
      <div className={FILTER_GRID}>
        <div className="sm:col-span-2">
          <DebouncedTaskSearch key={state.q} initial={state.q} />
        </div>
        <div>
          <label htmlFor="project" className={FIELD_LABEL}>
            Project
          </label>
          <select
            id="project"
            name="project"
            defaultValue={state.project}
            className={FIELD}
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
          <label htmlFor="workstream" className={FIELD_LABEL}>
            Workstream
          </label>
          <select
            id="workstream"
            name="workstream"
            defaultValue={state.workstream}
            className={FIELD}
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
          <label htmlFor="status" className={FIELD_LABEL}>
            Status
          </label>
          <select
            id="status"
            name="status"
            defaultValue={state.status}
            className={FIELD}
          >
            <option value="">Semua</option>
            {(['TODO', 'IN_PROGRESS', 'REVIEW', 'BLOCKED', 'DONE', 'CANCELLED'] as const).map((s) => (
              <option key={s} value={s}>
                {taskStatusLabel(s)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="priority" className={FIELD_LABEL}>
            Prioritas
          </label>
          <select
            id="priority"
            name="priority"
            defaultValue={state.priority}
            className={FIELD}
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
          <label htmlFor="deadline" className={FIELD_LABEL}>
            Deadline
          </label>
          <select
            id="deadline"
            name="deadline"
            defaultValue={state.deadline}
            className={FIELD}
          >
            <option value="">Semua</option>
            <option value="overdue">Overdue</option>
            <option value="week">Jatuh tempo minggu ini</option>
          </select>
        </div>
        <div>
          <label htmlFor="sort" className={FIELD_LABEL}>
            Urutkan
          </label>
          <select
            id="sort"
            name="sort"
            defaultValue={state.sort}
            className={FIELD}
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className={SUBMIT}>
          Terapkan
        </button>
      </div>
    </form>
    </FilterPanel>
  )
}