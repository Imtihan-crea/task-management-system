/**
 * Daily Tracker (HR Tahap 1, migrasi 021): aturan hitung murni supaya bisa dites.
 * Sumber rumus: sheet "Daily <Bulan> 26", "Daily Sum", "Monthly Summary"
 * (private/handoff/2026-11-16-pemetaan-hr-kpi.md bagian A dan J).
 *
 * Keputusan pemilik 16 Nov 2026: satu aturan 8 jam per hari kerja (harian 8,
 * mingguan 40, bulanan = hari kerja × 8); target bulanan bisa dikunci manual;
 * aturan disimpan berversi di hr_settings, default = nilai draft di bawah.
 * Daftar pilihan (kategori, lokasi, proyek internal) ada di Master Reference (migrasi 022).
 * Bug sheet yang tidak dibawa: durasi negatif lewat tengah malam (ditolak),
 * label status beda harian/bulanan (satu set label).
 */

export type TrackerRules = {
  hoursPerDay: number
  /** Kode Master Reference kategori "tidak produktif" (untuk D04 di Tahap 3). */
  breakCategoryCode: string
  /** Nyala: hari cuti berbayar disetujui mengurangi target. Mati (bawaan): hari cuti dihitung jam kerja (keputusan pemilik 19 Nov 2026). */
  leaveReducesTarget: boolean
  /** Ambang jam, urut dari tertinggi: [lebih, sesuai, cukup]; di bawahnya = kurang. */
  dailyThresholds: [number, number, number]
  weeklyThresholds: [number, number, number]
  /** Ambang bulanan sebagai jam per hari kerja; "lebih" = > hari × angka pertama. */
  monthlyPerDay: [number, number, number]
}

export const DEFAULT_RULES: TrackerRules = {
  hoursPerDay: 8,
  breakCategoryCode: 'BREAK_PERSONAL',
  leaveReducesTarget: false,
  dailyThresholds: [8.1, 7, 6],
  weeklyThresholds: [40.1, 35.1, 30.1],
  monthlyPerDay: [8, 7, 6],
}

/** Validasi aturan sebelum disimpan; null = sah. */
export function rulesError(r: TrackerRules): string | null {
  if (!(r.hoursPerDay > 0 && r.hoursPerDay <= 24)) return 'Jam kerja per hari harus antara 0 dan 24.'
  const sets: [string, number[]][] = [
    ['harian', r.dailyThresholds],
    ['mingguan', r.weeklyThresholds],
    ['bulanan per hari kerja', r.monthlyPerDay],
  ]
  for (const [name, t] of sets) {
    if (t.length !== 3 || t.some((n) => !Number.isFinite(n) || n <= 0)) return `Ambang ${name} harus 3 angka lebih dari 0.`
    if (!(t[0] > t[1] && t[1] > t[2])) return `Ambang ${name} harus menurun: lebih > sesuai > cukup.`
  }
  return null
}

/** Gabung aturan tersimpan (bisa sebagian / dari versi lama) dengan default. */
export function mergeRules(saved: Partial<TrackerRules> | null | undefined): TrackerRules {
  return { ...DEFAULT_RULES, ...(saved ?? {}) }
}

export type WorkStatus = 'LEBIH' | 'SESUAI' | 'CUKUP' | 'KURANG'

export const STATUS_LABEL: Record<WorkStatus, string> = {
  LEBIH: 'Lebih dari target',
  SESUAI: 'Sesuai target',
  CUKUP: 'Cukup',
  KURANG: 'Kurang',
}

const byThreshold = (hours: number, [over, on, ok]: [number, number, number]): WorkStatus =>
  hours >= over ? 'LEBIH' : hours >= on ? 'SESUAI' : hours >= ok ? 'CUKUP' : 'KURANG'

export const dailyStatus = (hours: number, r: TrackerRules = DEFAULT_RULES) => byThreshold(hours, r.dailyThresholds)
export const weeklyStatus = (hours: number, r: TrackerRules = DEFAULT_RULES) => byThreshold(hours, r.weeklyThresholds)

/** Sheet: ≥ hari×8+0.1 LUAR BIASA, ≥ hari×7, ≥ hari×6. */
export function monthlyStatus(hours: number, workdays: number, r: TrackerRules = DEFAULT_RULES): WorkStatus {
  const [over, on, ok] = r.monthlyPerDay
  return byThreshold(hours, [workdays * over + 0.1, workdays * on, workdays * ok])
}

/** 'HH:MM' atau 'HH:MM:SS' -> menit sejak tengah malam; null bila tidak valid. */
export function parseTime(value: string): number | null {
  const v = value.trim()
  // 24:00 = akhir hari (aktivitas yang selesai tepat tengah malam; Postgres time menerimanya).
  if (/^24:00(?::00)?$/.test(v)) return 1440
  const m = /^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/.exec(v)
  return m ? Number(m[1]) * 60 + Number(m[2]) : null
}

export const formatMinutes = (min: number) =>
  `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`

/** Durasi menit; null bila selesai tidak sesudah mulai (lewat tengah malam: pecah jadi 2 entri). */
export function durationMinutes(start: string, end: string): number | null {
  const s = parseTime(start)
  const e = parseTime(end)
  if (s === null || e === null || e <= s) return null
  return e - s
}

export type TimeRange = { id?: string; start: string; end: string }

/** Entri lain di hari yang sama yang tumpang tindih (bersentuhan di ujung boleh). */
export function findOverlap(existing: TimeRange[], candidate: TimeRange): TimeRange | null {
  const cs = parseTime(candidate.start)!
  const ce = parseTime(candidate.end)!
  return (
    existing.find((x) => {
      if (candidate.id && x.id === candidate.id) return false
      return parseTime(x.start)! < ce && cs < parseTime(x.end)!
    }) ?? null
  )
}

/** Jam mulai saran = jam selesai paling akhir di hari itu (sheet: `=I{r-1}`). */
export function suggestStart(existing: TimeRange[]): string | null {
  const ends = existing.map((x) => parseTime(x.end)!)
  return ends.length ? formatMinutes(Math.max(...ends)) : null
}

/** Minggu ISO dari 'YYYY-MM-DD' (sheet: ISOWEEKNUM). */
export function isoWeek(date: string): number {
  const d = new Date(`${date}T00:00:00Z`)
  const day = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - day)
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1)
  return Math.ceil(((d.getTime() - yearStart) / 86_400_000 + 1) / 7)
}

/** Senin minggu ISO dari tanggal itu. */
export function weekStart(date: string): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() || 7) - 1))
  return d.toISOString().slice(0, 10)
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export type CalendarDay = { day: string; kind: 'HOLIDAY' | 'WORKDAY'; name?: string | null }

/** Hari kerja dalam rentang [from, to]: Senin–Jumat, minus libur, plus hari kerja pengganti. */
export function workingDays(from: string, to: string, calendar: CalendarDay[]): string[] {
  const special = new Map(calendar.map((c) => [c.day, c.kind]))
  const out: string[] = []
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const dow = new Date(`${d}T00:00:00Z`).getUTCDay()
    const kind = special.get(d)
    if (kind === 'WORKDAY' || (kind !== 'HOLIDAY' && dow >= 1 && dow <= 5)) out.push(d)
  }
  return out
}

/** 'YYYY-MM' -> [tanggal pertama, tanggal terakhir]. */
export function monthRange(month: string): [string, string] {
  const [y, m] = month.split('-').map(Number)
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return [`${month}-01`, `${month}-${String(last).padStart(2, '0')}`]
}

export type LogRow = {
  user_id: string
  work_date: string
  project_name: string
  category: string
  duration_minutes: number
  /** Klien dari projects.client; kosong/tak ada = Internal / tanpa klien. */
  client?: string | null
}

export const NO_CLIENT = 'Internal / tanpa klien'

export type Breakdown = { key: string; hours: number; count: number; percent: number }

const round2 = (n: number) => Math.round(n * 100) / 100

/** Jam & frekuensi per kunci (proyek / kategori / klien), urut jam terbanyak (sheet Month Track). */
export function breakdown(logs: LogRow[], key: 'project_name' | 'category' | 'client'): Breakdown[] {
  const total = logs.reduce((s, l) => s + l.duration_minutes, 0)
  const map = new Map<string, { min: number; count: number }>()
  for (const l of logs) {
    const k = key === 'client' ? l.client?.trim() || NO_CLIENT : l[key]
    const cur = map.get(k) ?? { min: 0, count: 0 }
    cur.min += l.duration_minutes
    cur.count++
    map.set(k, cur)
  }
  return [...map.entries()]
    .map(([k, v]) => ({ key: k, hours: round2(v.min / 60), count: v.count, percent: total ? round2((v.min / total) * 100) : 0 }))
    .sort((a, b) => b.hours - a.hours || a.key.localeCompare(b.key))
}

export type MonthlySummary = {
  /** Jam kerja tercatat + jam cuti berbayar (`leaveHours`). */
  totalHours: number
  leaveHours: number
  workdays: number
  targetHours: number
  /** Persen jam aktual terhadap target (sheet: C/D). */
  effectiveness: number
  activities: number
  activeDays: number
  avgHoursPerActiveDay: number
  avgHoursPerActivity: number
  status: WorkStatus
}

/**
 * Monthly Summary satu orang (sheet Monthly Summary). `lockedTarget` = target
 * yang dikunci HR (hr_month_targets); status tetap memakai ambang hari kerja,
 * kecuali target dikunci: ambang diskalakan ke target itu.
 */
export function monthlySummary(
  logs: LogRow[],
  workdays: number,
  rules: TrackerRules = DEFAULT_RULES,
  lockedTarget?: number | null,
  leaveDays = 0
): MonthlySummary {
  const minutes = logs.reduce((s, l) => s + l.duration_minutes, 0)
  const workHours = minutes / 60
  const activeDays = new Set(logs.map((l) => l.work_date)).size
  // Cuti berbayar disetujui: bawaan dihitung jam kerja (jam/hari per hari, keputusan pemilik
  // 19 Nov 2026); bila aturan leaveReducesTarget dinyalakan, target yang dikurangi (bukan keduanya).
  const days = Math.min(leaveDays, workdays)
  const leaveHours = rules.leaveReducesTarget ? 0 : round2(days * rules.hoursPerDay)
  const totalHours = round2(workHours + leaveHours)
  const cut = rules.leaveReducesTarget ? days * rules.hoursPerDay : 0
  const targetHours = Math.max((lockedTarget ?? workdays * rules.hoursPerDay) - cut, 0)
  const effectiveDays = targetHours / rules.hoursPerDay
  return {
    totalHours,
    leaveHours,
    workdays,
    targetHours,
    effectiveness: targetHours ? round2((totalHours / targetHours) * 100) : 0,
    activities: logs.length,
    activeDays,
    avgHoursPerActiveDay: activeDays ? round2(workHours / activeDays) : 0,
    avgHoursPerActivity: logs.length ? round2(workHours / logs.length) : 0,
    status: monthlyStatus(totalHours, effectiveDays, rules),
  }
}

/** Jam per tanggal (untuk status harian / mingguan). */
export function hoursByDate(logs: LogRow[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const l of logs) map.set(l.work_date, (map.get(l.work_date) ?? 0) + l.duration_minutes / 60)
  return map
}
