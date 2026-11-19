/**
 * Cuti (HR Tahap 2, migrasi 024; jenis diganti migrasi 026). Murni supaya bisa dites.
 * Keputusan pemilik 16 Nov 2026: penyetuju = izin leave.approve (atau hr.manage).
 * Keputusan pemilik 19 Nov 2026 (mengikuti UU 13/2003 jo. UU 6/2023 dan UU 4/2024 KIA):
 * - empat jenis: Cuti Tahunan, Cuti Sakit, Cuti Khusus (alasan + batas hari), Cuti di Luar Tanggungan;
 * - setiap hari cuti berbayar yang disetujui dihitung sebagai jam kerja (jam/hari, bawaan 8);
 *   Cuti di Luar Tanggungan tidak dihitung;
 * - saldo = hak cuti (HR) − hari Cuti Tahunan disetujui − hari cuti bersama di kalender tahun itu.
 */
import { addDays, workingDays, type CalendarDay } from '@/lib/hr/tracker'

export type LeaveKind = 'CUTI' | 'SAKIT' | 'KHUSUS' | 'TANPA_GAJI'
export type LeaveStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED'

export const LEAVE_KINDS: { value: LeaveKind; label: string }[] = [
  { value: 'CUTI', label: 'Cuti Tahunan' },
  { value: 'SAKIT', label: 'Cuti Sakit' },
  { value: 'KHUSUS', label: 'Cuti Khusus' },
  { value: 'TANPA_GAJI', label: 'Cuti di Luar Tanggungan' },
]
export const KIND_LABEL = Object.fromEntries(LEAVE_KINDS.map((k) => [k.value, k.label])) as Record<LeaveKind, string>

/** Jenis yang dibayar = dihitung jam kerja. */
export const PAID_KINDS: LeaveKind[] = ['CUTI', 'SAKIT', 'KHUSUS']

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

/** Validasi jenis + alasan Cuti Khusus + batas hari; null = sah. `days` = hari kerja rentang. */
export function kindError(kind: string, special: string | null, start: string, end: string, days: number): string | null {
  if (!LEAVE_KINDS.some((k) => k.value === kind)) return 'Pilih jenis cuti.'
  if (kind !== 'KHUSUS') return rangeError(start, end)
  const r = SPECIAL_REASONS.find((x) => x.value === special)
  if (!r) return 'Pilih alasan Cuti Khusus.'
  const err = rangeError(start, end, r.maxSpan ?? MAX_SPAN_DAYS)
  if (err) return err
  if (r.maxDays && days > r.maxDays) return `Cuti Khusus "${r.label}" paling lama ${r.maxDays} hari kerja.`
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
export function leaveDaysIn(rows: LeaveRow[], from: string, to: string, calendar: CalendarDay[]): Record<LeaveKind, number> {
  const out: Record<LeaveKind, number> = { CUTI: 0, SAKIT: 0, KHUSUS: 0, TANPA_GAJI: 0 }
  for (const l of rows) {
    if (l.status !== 'APPROVED') continue
    const s = l.start_date > from ? l.start_date : from
    const e = l.end_date < to ? l.end_date : to
    if (s > e) continue
    out[l.kind] += workingDays(s, e, calendar).length
  }
  return out
}

/** Hari cuti berbayar (dihitung jam kerja) dari hasil leaveDaysIn. */
export const paidLeaveDays = (l: Record<LeaveKind, number>) => PAID_KINDS.reduce((s, k) => s + l[k], 0)

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

/** Saldo cuti tahunan tahun `year`: hak (HR) − hari Cuti Tahunan disetujui − cuti bersama (`joint`). */
export function annualBalance(quota: number | null, rows: LeaveRow[], year: string, calendar: CalendarDay[], joint = 0): Balance {
  const from = `${year}-01-01`
  const to = `${year}-12-31`
  const cuti = rows.filter((r) => r.kind === 'CUTI')
  const taken = leaveDaysIn(cuti, from, to, calendar).CUTI
  const pending = leaveDaysIn(cuti.map((r) => ({ ...r, status: r.status === 'PENDING' ? 'APPROVED' : 'REJECTED' })), from, to, calendar).CUTI
  return { quota, taken, joint, pending, remaining: quota === null ? null : quota - taken - joint }
}
