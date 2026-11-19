import { fetchMeetingProjects } from '@/lib/data/meetings'
import { getActiveUsers } from '@/lib/data/users'
import { MEETING_STATUSES, MEETING_TYPES } from '@/lib/db/schema'
import { MEETING_STATUS_LABELS, MEETING_TYPE_LABELS } from '@/types/meeting'
import type { MeetingFilters } from '@/lib/data/meetings'
import { FIELD as inputCls, FIELD_LABEL, FILTER_GRID, FilterPanel, SUBMIT } from '@/components/ui/primitives'

/**
 * Form filter /meetings (§8, §35): Search, Project, Type, Status,
 * Organizer, Date Range. Dipisah dari page + Suspense sendiri supaya
 * header & tab langsung tampil tanpa menunggu query.
 */
export async function MeetingFilterForm({ filters }: { filters: MeetingFilters }) {
  const [projects, users] = await Promise.all([fetchMeetingProjects(), getActiveUsers()])

  const active = [filters.q, filters.project, filters.type, filters.status, filters.organizer, filters.dateFrom, filters.dateTo].filter(Boolean).length

  return (
    <FilterPanel active={active}>
    <form method="get">
      {filters.tab !== 'upcoming' && <input type="hidden" name="tab" value={filters.tab} />}
      <div className={FILTER_GRID}>
        <div className="sm:col-span-2">
          <label htmlFor="mq" className={FIELD_LABEL}>
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
          <label htmlFor="mproject" className={FIELD_LABEL}>
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
          <label htmlFor="mtype" className={FIELD_LABEL}>
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
          <label htmlFor="mstatus" className={FIELD_LABEL}>
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
          <label htmlFor="morganizer" className={FIELD_LABEL}>
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
        <div className="grid grid-cols-2 gap-3 sm:col-span-2">
          <div>
            <label htmlFor="mfrom" className={FIELD_LABEL}>
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
            <label htmlFor="mto" className={FIELD_LABEL}>
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
        <button type="submit" className={SUBMIT}>
          Terapkan
        </button>
      </div>
    </form>
    </FilterPanel>
  )
}