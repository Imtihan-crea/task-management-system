/**
 * Cuti / izin / sakit (HR Tahap 2, migrasi 024). Murni supaya bisa dites.
 * Keputusan pemilik 16 Nov 2026: penyetuju = izin leave.approve (atau hr.manage);
 * target jam bulanan sementara TIDAK dikurangi (ikut sheet), tetapi bisa dinyalakan
 * lewat aturan `leaveReducesTarget`; saldo = hak cuti (diisi HR) − hari CUTI
 * disetujui tahun berjalan; izin & sakit tidak memotong saldo; cuti bersama tidak memotong.
 */
import { addDays, workingDays, type CalendarDay } from '@/lib/hr/tracker'

export type LeaveKind = 'CUTI' | 'IZIN' | 'SAKIT'
export type LeaveStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED'

export const LEAVE_KINDS: { value: LeaveKind; label: string }[] = [
  { value: 'CUTI', label: 'Cuti' },
  { value: 'IZIN', label: 'Izin' },
  { value: 'SAKIT', label: 'Sakit' },
]
export const KIND_LABEL: Record<LeaveKind, string> = { CUTI: 'Cuti', IZIN: 'Izin', SAKIT: 'Sakit' }
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
export function rangeError(start: string, end: string): string | null {
  const ok = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d))
  if (!ok(start) || !ok(end)) return 'Tanggal tidak valid.'
  if (end < start) return 'Tanggal selesai tidak boleh sebelum tanggal mulai.'
  if (addDays(start, MAX_SPAN_DAYS - 1) < end) return `Satu pengajuan paling lama ${MAX_SPAN_DAYS} hari; pecah menjadi beberapa pengajuan.`
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

/** Hari kerja cuti/izin/sakit yang disetujui per jenis dalam rentang [from, to] (mis. satu bulan). */
export function leaveDaysIn(rows: LeaveRow[], from: string, to: string, calendar: CalendarDay[]): Record<LeaveKind, number> {
  const out: Record<LeaveKind, number> = { CUTI: 0, IZIN: 0, SAKIT: 0 }
  for (const l of rows) {
    if (l.status !== 'APPROVED') continue
    const s = l.start_date > from ? l.start_date : from
    const e = l.end_date < to ? l.end_date : to
    if (s > e) continue
    out[l.kind] += workingDays(s, e, calendar).length
  }
  return out
}

/** Tanggal-tanggal hari kerja yang tertutup cuti/izin/sakit disetujui (untuk pengingat & D01). */
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

export type Balance = { quota: number | null; taken: number; pending: number; remaining: number | null }

/** Saldo cuti tahunan tahun `year`: hak (HR) − hari CUTI disetujui tahun itu. */
export function annualBalance(quota: number | null, rows: LeaveRow[], year: string, calendar: CalendarDay[]): Balance {
  const from = `${year}-01-01`
  const to = `${year}-12-31`
  const cuti = rows.filter((r) => r.kind === 'CUTI')
  const taken = leaveDaysIn(cuti, from, to, calendar).CUTI
  const pending = leaveDaysIn(cuti.map((r) => ({ ...r, status: r.status === 'PENDING' ? 'APPROVED' : 'REJECTED' })), from, to, calendar).CUTI
  return { quota, taken, pending, remaining: quota === null ? null : quota - taken }
}
