/**
 * Aturan alih task (20 Nov 2026). Murni supaya bisa dites.
 * Waktu dari form memakai <input type="datetime-local"> dan dibaca sebagai WIB.
 */

export type TransferKind = 'PERMANENT' | 'TEMPORARY'
export type TransferStatus = 'PENDING' | 'SCHEDULED' | 'ACTIVE' | 'EXPIRED' | 'DONE' | 'REJECTED' | 'CANCELLED'

/** Status yang masih berjalan (satu per task, dijaga unique index di 032). */
export const OPEN_TRANSFER_STATUSES: TransferStatus[] = ['PENDING', 'SCHEDULED', 'ACTIVE', 'EXPIRED']

export const TRANSFER_STATUS_LABEL: Record<TransferStatus, string> = {
  PENDING: 'Menunggu PM',
  SCHEDULED: 'Terjadwal',
  ACTIVE: 'Berjalan',
  EXPIRED: 'Masa habis, menunggu PM',
  DONE: 'Selesai',
  REJECTED: 'Ditolak',
  CANCELLED: 'Dibatalkan',
}

/** Pengajuan consultant paling lama ±3 bulan; PM/Admin bebas. */
export const MAX_REQUEST_DAYS = 92
/** Toleransi "waktu mulai di masa lalu" (form diisi beberapa menit). */
const PAST_GRACE_MS = 10 * 60 * 1000

/** "2026-11-21T08:00" (WIB) -> ISO UTC; '' bila tidak valid. */
export function wibLocalToISO(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return ''
  const d = new Date(`${value}:00+07:00`)
  return Number.isNaN(d.getTime()) ? '' : d.toISOString()
}

/** ISO -> "YYYY-MM-DDTHH:MM" WIB (nilai awal datetime-local). */
export function isoToWibLocal(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return new Date(d.getTime() + 7 * 3600 * 1000).toISOString().slice(0, 16)
}

/** Pesan galat pengajuan/pengalihan, atau null bila sah. */
export function transferError(i: {
  kind: string
  fromUserId: string
  toUserId: string
  startsAt: string
  endsAt: string
  byManager: boolean
  now: Date
}): string | null {
  if (i.kind !== 'PERMANENT' && i.kind !== 'TEMPORARY') return 'Pilih jenis alih task.'
  if (!i.toUserId) return 'Pilih consultant pengganti.'
  if (i.toUserId === i.fromUserId) return 'Pengganti harus orang lain, bukan pemegang task sekarang.'
  if (i.kind === 'PERMANENT') return null
  if (!i.startsAt || !i.endsAt) return 'Isi waktu mulai dan waktu selesai.'
  const start = new Date(i.startsAt).getTime()
  const end = new Date(i.endsAt).getTime()
  if (Number.isNaN(start) || Number.isNaN(end)) return 'Masukkan waktu yang valid.'
  if (end <= start) return 'Waktu selesai harus setelah waktu mulai.'
  if (end <= i.now.getTime()) return 'Waktu selesai sudah lewat.'
  if (!i.byManager) {
    if (start < i.now.getTime() - PAST_GRACE_MS) return 'Waktu mulai tidak boleh di masa lalu.'
    if (end - start > MAX_REQUEST_DAYS * 86400 * 1000) return 'Rentang paling lama 3 bulan. Untuk lebih lama, minta PM mengalihkan.'
  }
  return null
}

/** Langkah penjadwal untuk satu alih task: mulai, akhiri, atau tidak ada. */
export function transferTick(
  t: { status: string; starts_at: string | null; ends_at: string | null },
  now: Date
): 'start' | 'end' | null {
  const due = (iso: string | null) => iso !== null && new Date(iso).getTime() <= now.getTime()
  if (t.status === 'SCHEDULED' && (t.starts_at === null || due(t.starts_at))) return 'start'
  if (t.status === 'ACTIVE' && due(t.ends_at)) return 'end'
  return null
}

/** Status sesudah dimulai: permanen langsung selesai, sementara berjalan. */
export function statusAfterStart(kind: string): TransferStatus {
  return kind === 'PERMANENT' ? 'DONE' : 'ACTIVE'
}
