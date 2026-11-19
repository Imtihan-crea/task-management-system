import { parseMeetingTab } from '@/types/meeting'
import type { MeetingFilters } from '@/lib/data/meetings'

function sanitize(value: string | undefined): string {
  return (value ?? '').replace(/[,()*%]/g, ' ').trim().slice(0, 60)
}

function sanitizeDate(value: string | undefined): string {
  const v = (value ?? '').trim().slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : ''
}

/** Param URL /meetings -> filter. Satu sumber untuk halaman dan export Excel. */
export function parseMeetingFilters(get: (key: string) => string): MeetingFilters {
  return {
    tab: parseMeetingTab(get('tab') || undefined),
    q: sanitize(get('q')),
    project: get('project'),
    type: get('type'),
    status: get('status'),
    organizer: get('organizer'),
    dateFrom: sanitizeDate(get('from')),
    dateTo: sanitizeDate(get('to')),
  }
}
