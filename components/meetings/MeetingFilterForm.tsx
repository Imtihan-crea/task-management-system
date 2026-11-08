import { fetchMeetingProjects } from '@/lib/data/meetings'
import { getActiveUsers } from '@/lib/data/users'
import { MEETING_STATUSES, MEETING_TYPES } from '@/lib/db/schema'
import { MEETING_STATUS_LABELS, MEETING_TYPE_LABELS } from '@/types/meeting'
import type { MeetingFilters } from '@/lib/data/meetings'

const inputCls =
  'min-h-[44px] w-full rounded-lg border px-3 py-2 text-base dark:border-zinc-700 dark:bg-zinc-800'

/**
 * Form filter /meetings (§8, §35): Search, Project, Type, Status,
 * Organizer, Date Range. Dipisah dari page + Suspense sendiri supaya
 * header & tab langsung tampil tanpa menunggu query.
 */
export async function MeetingFilterForm({ filters }: { filters: MeetingFilters }) {
  const [projects, users] = await Promise.all([fetchMeetingProjects(), getActiveUsers()])

  return (
    <form
      method="get"
      className="mt-4 flex flex-col gap-3 rounded-2xl bg-white p-4 shadow dark:bg-zinc-900"
    >
      {filters.tab !== 'upcoming' && <input type="hidden" name="tab" value={filters.tab} />}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="sm:col-span-2 lg:col-span-1">
          <label htmlFor="mq" className="mb-1 block text-sm font-medium">
            Cari
          </label>
          <input
            id="mq"
            name="q"
            defaultValue={filters.q}
            maxLength={60}
            placeholder="Kode, judul, lokasi..."
            className={inputCls}
          />
        </div>
        <div>
          <label htmlFor="mproject" className="mb-1 block text-sm font-medium">
            Project
          </label>
          <select id="mproject" name="project" defaultValue={filters.project} className={inputCls}>
            <option value="">Semua Project</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code} · {p.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="mtype" className="mb-1 block text-sm font-medium">
            Tipe Meeting
          </label>
          <select id="mtype" name="type" defaultValue={filters.type} className={inputCls}>
            <option value="">Semua</option>
            {MEETING_TYPES.map((t) => (
              <option key={t} value={t}>
                {MEETING_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="mstatus" className="mb-1 block text-sm font-medium">
            Status
          </label>
          <select id="mstatus" name="status" defaultValue={filters.status} className={inputCls}>
            <option value="">Semua</option>
            {MEETING_STATUSES.map((s) => (
              <option key={s} value={s}>
                {MEETING_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="morganizer" className="mb-1 block text-sm font-medium">
            Organizer
          </label>
          <select
            id="morganizer"
            name="organizer"
            defaultValue={filters.organizer}
            className={inputCls}
          >
            <option value="">Semua</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.full_name || u.email}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="mfrom" className="mb-1 block text-sm font-medium">
              Dari
            </label>
            <input
              id="mfrom"
              name="from"
              type="date"
              defaultValue={filters.dateFrom}
              className={inputCls}
            />
          </div>
          <div>
            <label htmlFor="mto" className="mb-1 block text-sm font-medium">
              Sampai
            </label>
            <input
              id="mto"
              name="to"
              type="date"
              defaultValue={filters.dateTo}
              className={inputCls}
            />
          </div>
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