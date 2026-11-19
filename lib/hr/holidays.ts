/**
 * Libur nasional + cuti bersama Indonesia dari data publik
 * github.com/guangrei/APIHariLibur_V2 (calendar.json, dikelola komunitas dari SKB menteri).
 * Bentuk: { "2026-03-21": { holiday: true, summary: ["Hari Idul Fitri"], description: [...] }, ..., info: {...} }.
 * Hanya entri holiday=true yang diambil; entri "Perayaan" (mis. 1 Ramadan) bukan hari libur.
 */
export const HOLIDAY_FEED_URL = 'https://raw.githubusercontent.com/guangrei/APIHariLibur_V2/main/calendar.json'

export type FeedHoliday = { day: string; name: string }

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/

export function parseHolidayFeed(feed: unknown, year: string): FeedHoliday[] {
  if (!feed || typeof feed !== 'object') return []
  const out: FeedHoliday[] = []
  for (const [day, raw] of Object.entries(feed as Record<string, unknown>)) {
    if (!DAY_RE.test(day) || !day.startsWith(`${year}-`) || !raw || typeof raw !== 'object') continue
    const entry = raw as { holiday?: unknown; summary?: unknown }
    if (entry.holiday !== true) continue
    const parts = Array.isArray(entry.summary) ? entry.summary.filter((s): s is string => typeof s === 'string' && s.trim() !== '') : []
    const name = (parts.join(' / ').replace(/\s+/g, ' ').trim() || 'Libur nasional').slice(0, 120)
    out.push({ day, name })
  }
  return out.sort((a, b) => a.day.localeCompare(b.day))
}

/** Tanggal yang sudah ada di kalender (isian HR) tidak ditimpa. */
export function newHolidays(feed: FeedHoliday[], existingDays: Iterable<string>): FeedHoliday[] {
  const have = new Set(existingDays)
  return feed.filter((h) => !have.has(h.day))
}
