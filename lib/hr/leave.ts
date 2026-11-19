/**
 * Cuti (HR Tahap 2, migrasi 024; jenis diganti migrasi 026). Murni supaya bisa dites.
 * Keputusan pemilik 16 Nov 2026: penyetuju = izin leave.approve (atau hr.manage).
 * Keputusan pemilik 19 Nov 2026 (mengikuti UU 13/2003 jo. UU 6/2023 dan UU 4/2024 KIA):
 * - empat jenis awal: Cuti Tahunan, Cuti Sakit, Cuti Khusus (alasan + batas hari), Cuti di Luar Tanggungan;
 * - setiap hari cuti berbayar yang disetujui dihitung sebagai jam kerja (jam/hari, bawaan 8);
 * - saldo = hak cuti (HR) − hari cuti disetujui − hari cuti bersama di kalender tahun itu.
 * Keputusan pemilik 19 Nov 2026 (migrasi 027): jenis cuti diatur HR di Master Reference (LEAVE_TYPE);
 * per jenis: dihitung jam kerja, memotong jatah, batas hari. Cuti bersama memotong jatah = aturan HR
 * (`jointLeaveUsesQuota`). Cuti Khusus (kode KHUSUS) tetap wajib memilih alasan dari SPECIAL_REASONS.
 */
import { addDays, workingDays, type CalendarDay } from '@/lib/hr/tracker'

/** Kode jenis dari Master Reference (list LEAVE_TYPE); migrasi 027. */
export type LeaveKind = string
export type LeaveStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED'

/** Jenis cuti dari Master Reference. Fungsi di bawah menerimanya sebagai parameter supaya murni. */
export type LeaveType = {
  code: string
  label: string
  description: string | null
  counts_hours: boolean
  uses_quota: boolean
  max_days: number | null
  archived_at: string | null
}

/** Kode jenis yang alasannya wajib dipilih dari SPECIAL_REASONS (dasar UU, tetap di kode). */
export const SPECIAL_KIND = 'KHUSUS'

export const kindLabels = (types: Pick<LeaveType, 'code' | 'label'>[]): Record<string, string> => Object.fromEntries(types.map((t) => [t.code, t.label]))

/** Jenis yang bisa dipilih untuk pengajuan baru. */
export const activeTypes = (types: LeaveType[]) => types.filter((t) => !t.archived_at)

/**
 * Alasan Cuti Khusus. `maxDays` = hari kerja (UU 13/2003 Pasal 93 ayat 4, Pasal 81);
 * `maxSpan` = hari kalender untuk cuti panjang (Pasal 82, UU 4/2024).
 */
export type SpecialReason = { value: string; label: string; maxDays?: number; maxSpan?: number }
export const SPECIAL_REASONS: SpecialReason[] = [
  { value: 'MENIKAH', label: 'Menikah', maxDays: 3 },
  { value: 'MENIKAHKAN_ANAK', label: 'Menikahkan anak', maxDays: 2 },
  { value: 'KHITAN_BAPTIS_ANAK', label: 'Khitanan / baptis anak', maxDays: 2 },
  { value: 'ISTRI_MELAHIRKAN', label: 'Istri melahirkan / keguguran', maxDays: 5 },
  { value: 'DUKA_KELUARGA_INTI', label: 'Suami/istri, orang tua/mertua, anak/menantu meninggal', maxDays: 2 },
  { value: 'DUKA_SERUMAH', label: 'Anggota keluarga serumah meninggal', maxDays: 1 },
  { value: 'HAID', label: 'Haid hari pertama dan kedua', maxDays: 2 },
  { value: 'MELAHIRKAN', label: 'Melahirkan (3 bulan)', maxSpan: 92 },
  { value: 'KEGUGURAN', label: 'Keguguran (1,5 bulan)', maxSpan: 46 },
]
export const SPECIAL_LABEL = Object.fromEntries(SPECIAL_REASONS.map((r) => [r.value, r.label])) as Record<string, string>

export const STATUS_LABEL: Record<LeaveStatus, string> = {
  PENDING: 'Menunggu persetujuan',
  APPROVED: 'Disetujui',
  REJECTED: 'Ditolak',
  CANCELLED: 'Dibatalkan',
}

export type LeaveRow = { id?: string; user_id: string; kind: LeaveKind; start_date: string; end_date: string; status: LeaveStatus }

/** Batas lamanya satu pengajuan (hari kalender). */
export const MAX_SPAN_DAYS = 60

/** Validasi tanggal pengajuan; null = sah. */
export function rangeError(start: string, end: string, maxSpan = MAX_SPAN_DAYS): string | null {
  const ok = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d))
  if (!ok(start) || !ok(end)) return 'Tanggal tidak valid.'
  if (end < start) return 'Tanggal selesai tidak boleh sebelum tanggal mulai.'
  if (addDays(start, maxSpan - 1) < end) return `Satu pengajuan paling lama ${maxSpan} hari; pecah menjadi beberapa pengajuan.`
  return null
}

/**
 * Validasi jenis (harus aktif di master) + alasan Cuti Khusus + batas hari; null = sah.
 * `days` = hari kerja rentang. Batas `max_days` jenis berlaku di samping batas alasan Cuti Khusus.
 */
export function kindError(types: LeaveType[], kind: string, special: string | null, start: string, end: string, days: number): string | null {
  const type = activeTypes(types).find((t) => t.code === kind)
  if (!type) return 'Pilih jenis cuti.'
  let err: string | null
  if (kind !== SPECIAL_KIND) err = rangeError(start, end)
  else {
    const r = SPECIAL_REASONS.find((x) => x.value === special)
    if (!r) return `Pilih alasan ${type.label}.`
    err = rangeError(start, end, r.maxSpan ?? MAX_SPAN_DAYS)
    if (!err && r.maxDays && days > r.maxDays) err = `${type.label} "${r.label}" paling lama ${r.maxDays} hari kerja.`
  }
  if (err) return err
  if (type.max_days !== null && days > type.max_days) return `${type.label} paling lama ${type.max_days} hari kerja per pengajuan.`
  return null
}

/** Jumlah hari kerja dalam rentang (libur & akhir pekan tidak dihitung). */
export const leaveDays = (start: string, end: string, calendar: CalendarDay[]) => workingDays(start, end, calendar).length

/** Pengajuan aktif lain (menunggu/disetujui) milik user yang tanggalnya bertumpuk. */
export function overlappingLeave(existing: LeaveRow[], candidate: { id?: string; user_id: string; start_date: string; end_date: string }) {
  return (
    existing.find(
      (l) =>
        l.user_id === candidate.user_id &&
        l.id !== candidate.id &&
        (l.status === 'PENDING' || l.status === 'APPROVED') &&
        l.start_date <= candidate.end_date &&
        candidate.start_date <= l.end_date
    ) ?? null
  )
}

/** Hari kerja cuti yang disetujui per jenis dalam rentang [from, to] (mis. satu bulan). */
export function leaveDaysIn(rows: LeaveRow[], from: string, to: string, calendar: CalendarDay[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const l of rows) {
    if (l.status !== 'APPROVED') continue
    const s = l.start_date > from ? l.start_date : from
    const e = l.end_date < to ? l.end_date : to
    if (s > e) continue
    out[l.kind] = (out[l.kind] ?? 0) + workingDays(s, e, calendar).length
  }
  return out
}

/** Hari cuti yang dihitung jam kerja (`counts_hours` di master) dari hasil leaveDaysIn. */
export const paidLeaveDays = (l: Record<string, number>, types: LeaveType[]) => types.filter((t) => t.counts_hours).reduce((s, t) => s + (l[t.code] ?? 0), 0)

/**
 * Jenis yang jadi kolom rekap/export: semua yang aktif, ditambah yang diarsipkan tetapi masih
 * punya hari cuti di periode itu (supaya angkanya tidak hilang diam-diam).
 */
export const columnTypes = (types: LeaveType[], perPerson: Record<string, number>[]) =>
  types.filter((t) => !t.archived_at || perPerson.some((l) => (l[t.code] ?? 0) > 0))

/** Tanggal-tanggal hari kerja yang tertutup cuti disetujui (untuk pengingat & D01). */
export function leaveDates(rows: LeaveRow[], from: string, to: string, calendar: CalendarDay[]): Set<string> {
  const out = new Set<string>()
  for (const l of rows) {
    if (l.status !== 'APPROVED') continue
    const s = l.start_date > from ? l.start_date : from
    const e = l.end_date < to ? l.end_date : to
    if (s <= e) for (const d of workingDays(s, e, calendar)) out.add(d)
  }
  return out
}

export type Balance = { quota: number | null; taken: number; joint: number; pending: number; remaining: number | null }

/** Hari libur kalender yang namanya cuti bersama (Senin–Jumat saja). */
export function jointLeaveDays(calendar: { day: string; kind: string; name?: string | null }[]): number {
  return calendar.filter((c) => c.kind === 'HOLIDAY' && /cuti bersama/i.test(c.name ?? '') && ![0, 6].includes(new Date(`${c.day}T00:00:00Z`).getUTCDay())).length
}

/** Cuti bersama yang memotong jatah: 0 bila HR mematikan aturannya (`jointLeaveUsesQuota`). */
export const jointQuotaDays = (calendar: { day: string; kind: string; name?: string | null }[], usesQuota: boolean) => (usesQuota ? jointLeaveDays(calendar) : 0)

/**
 * Saldo cuti tahunan tahun `year`: hak (HR) − hari semua jenis yang `uses_quota` disetujui − cuti bersama (`joint`,
 * lihat jointQuotaDays). `pending` = hari jenis pemotong yang masih menunggu.
 */
export function annualBalance(quota: number | null, rows: LeaveRow[], year: string, calendar: CalendarDay[], joint: number, types: LeaveType[]): Balance {
  const from = `${year}-01-01`
  const to = `${year}-12-31`
  const quotaCodes = new Set(types.filter((t) => t.uses_quota).map((t) => t.code))
  const sum = (d: Record<string, number>) => [...quotaCodes].reduce((s, c) => s + (d[c] ?? 0), 0)
  const mine = rows.filter((r) => quotaCodes.has(r.kind))
  const taken = sum(leaveDaysIn(mine, from, to, calendar))
  const pending = sum(leaveDaysIn(mine.map((r) => ({ ...r, status: r.status === 'PENDING' ? 'APPROVED' : 'REJECTED' })), from, to, calendar))
  return { quota, taken, joint, pending, remaining: quota === null ? null : quota - taken - joint }
}
