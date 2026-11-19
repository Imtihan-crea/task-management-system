/**
 * Periode tampilan Daily Tracker: minggu ISO, bulan, atau rentang bebas.
 * Murni (tanpa server-only) supaya bisa dites. URL:
 *   ?periode=minggu&minggu=2026-W47 | ?periode=bulan&bulan=2026-11 | ?periode=rentang&dari=YYYY-MM-DD&sampai=YYYY-MM-DD
 * URL lama ?bulan=YYYY-MM (tanpa periode) tetap berarti bulan.
 */
import { addDays, isoWeek, monthRange, monthlySummary, weekStart, weeklyStatus, type LogRow, type MonthlySummary, type TrackerRules } from '@/lib/hr/tracker'

export type PeriodMode = 'minggu' | 'bulan' | 'rentang'
export const MAX_RANGE_DAYS = 366

export type Period = {
  mode: PeriodMode
  from: string
  to: string
  label: string
  /** Aman untuk nama berkas. */
  fileLabel: string
  /** 'YYYY-MM' bila periode tepat satu bulan penuh (satu-satunya kasus target terkunci berlaku). */
  month: string | null
  /** Parameter URL periode ini, sebelumnya, dan berikutnya. */
  query: Record<string, string>
  prev: Record<string, string>
  next: Record<string, string>
}

export type PeriodInput = { periode?: string | null; minggu?: string | null; bulan?: string | null; dari?: string | null; sampai?: string | null }

const DATE = /^\d{4}-\d{2}-\d{2}$/
const validDate = (s: string | null | undefined): s is string =>
  !!s && DATE.test(s) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s

const dayDiff = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000)

/** Tahun ISO (tahun milik hari Kamis di minggu itu). */
const isoYear = (date: string) => Number(addDays(weekStart(date), 3).slice(0, 4))

export const weekKey = (date: string) => `${isoYear(date)}-W${String(isoWeek(date)).padStart(2, '0')}`

/** 'YYYY-Www' -> Senin minggu itu; null bila tidak sah (mis. W53 di tahun tanpa minggu 53). */
export function weekFromKey(key: string | null | undefined): string | null {
  const m = /^(\d{4})-W(\d{2})$/.exec(key ?? '')
  if (!m) return null
  const w = Number(m[2])
  if (w < 1 || w > 53) return null
  const monday = addDays(weekStart(`${m[1]}-01-04`), (w - 1) * 7)
  return weekKey(monday) === key ? monday : null
}

const shiftMonth = (month: string, d: number) => {
  const [y, m] = month.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1 + d, 1)).toISOString().slice(0, 7)
}

const monthOf = (from: string, to: string) => {
  const m = from.slice(0, 7)
  const [a, b] = monthRange(m)
  return a === from && b === to ? m : null
}

function build(mode: PeriodMode, from: string, to: string): Period {
  if (mode === 'minggu') {
    const k = weekKey(from)
    return {
      mode, from, to, month: null, label: `Minggu ${k} (${from} s/d ${to})`, fileLabel: k,
      query: { periode: 'minggu', minggu: k },
      prev: { periode: 'minggu', minggu: weekKey(addDays(from, -7)) },
      next: { periode: 'minggu', minggu: weekKey(addDays(from, 7)) },
    }
  }
  if (mode === 'bulan') {
    const m = from.slice(0, 7)
    return {
      mode, from, to, month: m, label: `Bulan ${m}`, fileLabel: m,
      query: { periode: 'bulan', bulan: m },
      prev: { periode: 'bulan', bulan: shiftMonth(m, -1) },
      next: { periode: 'bulan', bulan: shiftMonth(m, 1) },
    }
  }
  const span = dayDiff(from, to) + 1
  const q = (f: string, t: string) => ({ periode: 'rentang', dari: f, sampai: t })
  return {
    mode, from, to, month: monthOf(from, to), label: `${from} s/d ${to}`, fileLabel: `${from}_sd_${to}`,
    query: q(from, to), prev: q(addDays(from, -span), addDays(from, -1)), next: q(addDays(to, 1), addDays(to, span)),
  }
}

/**
 * Baca periode dari query. Input tak sah -> periode bawaan (bulan hari ini) plus `error`
 * (halaman menampilkan pesan, export menjawab 400).
 */
export function parsePeriod(input: PeriodInput, today: string): { period: Period; error: string | null } {
  const fallback = (error: string | null) => ({ period: build('bulan', ...monthRange(today.slice(0, 7))), error })
  const mode: PeriodMode | null =
    input.periode === 'minggu' || input.periode === 'bulan' || input.periode === 'rentang'
      ? input.periode
      : input.dari || input.sampai ? 'rentang' : input.minggu ? 'minggu' : null

  if (mode === 'minggu') {
    if (!input.minggu) { const f = weekStart(today); return { period: build('minggu', f, addDays(f, 6)), error: null } }
    const from = weekFromKey(input.minggu)
    return from ? { period: build('minggu', from, addDays(from, 6)), error: null } : fallback('Minggu tidak sah. Pakai bentuk 2026-W47.')
  }
  if (mode === 'rentang') {
    if (!validDate(input.dari) || !validDate(input.sampai)) return fallback('Rentang butuh tanggal "dari" dan "sampai" yang sah (YYYY-MM-DD).')
    if (input.dari > input.sampai) return fallback('Tanggal "dari" harus sebelum atau sama dengan "sampai".')
    if (dayDiff(input.dari, input.sampai) + 1 > MAX_RANGE_DAYS) return fallback(`Rentang maksimal ${MAX_RANGE_DAYS} hari.`)
    return { period: build('rentang', input.dari, input.sampai), error: null }
  }
  if (input.bulan && !/^\d{4}-(0[1-9]|1[0-2])$/.test(input.bulan)) return fallback('Bulan tidak sah. Pakai bentuk 2026-11.')
  const [f, t] = monthRange(input.bulan || today.slice(0, 7))
  return { period: build('bulan', f, t), error: null }
}

/** Ringkasan periode: bulan penuh & rentang memakai ambang bulanan (target = hari kerja x jam/hari), minggu memakai ambang mingguan. */
export function periodSummary(
  period: Period,
  logs: LogRow[],
  workdays: number,
  rules: TrackerRules,
  lockedTarget: number | null,
  leaveDays: number
): MonthlySummary {
  const s = monthlySummary(logs, workdays, rules, period.month ? lockedTarget : null, leaveDays)
  return period.mode === 'minggu' ? { ...s, status: weeklyStatus(s.totalHours, rules) } : s
}
