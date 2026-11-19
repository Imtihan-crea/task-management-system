import 'server-only'

import { FREE_TEXT_MARK, type ReviewLog } from '@/lib/hr/data'
import type { loadRekap } from '@/lib/hr/rekap'
import { STATUS_LABEL, isoWeek } from '@/lib/hr/tracker'
import { excelDate, hoursOf, type ExcelColumn } from '@/lib/export/excel'

/** Label "(teks bebas)" hanya penanda di layar; di Excel tidak perlu. */
export const plain = (s: string | null | undefined) => (s ? s.replace(FREE_TEXT_MARK, '') : s)

/** Daily Data (kolom mengikuti sheet "Daily Data" Kasuat). Dipakai export rekap HR, tracker pribadi, dan tab Tracker project. */
export function dailyDataColumns(division: (userId: string) => string | null): ExcelColumn<ReviewLog>[] {
  return [
    { header: 'Tanggal', width: 12, value: (r) => excelDate(r.work_date) },
    { header: 'Minggu Ke -', width: 8, value: (r) => isoWeek(r.work_date) },
    { header: 'Nama', width: 20, value: (r) => r.person },
    { header: 'Divisi', width: 14, value: (r) => division(r.user_id) },
    { header: 'Proyek', width: 22, value: (r) => plain(r.project) },
    { header: 'Aktifitas', width: 28, value: (r) => r.activity },
    { header: 'Detail Pekerjaan', width: 40, value: (r) => r.detail },
    { header: 'Jam Mulai', width: 9, value: (r) => r.start_time?.slice(0, 5) },
    { header: 'Jam Selesai', width: 9, value: (r) => r.end_time?.slice(0, 5) },
    { header: 'Durasi (Jam)', width: 9, format: '0.00', value: (r) => hoursOf(r.duration_minutes) },
    { header: 'Lokasi', width: 14, value: (r) => r.location },
    { header: 'Kategori Aktifitas', width: 18, value: (r) => plain(r.category) },
    { header: 'Output/Deliverables', width: 30, value: (r) => r.output },
  ]
}

const name = (p: { full_name: string | null; email: string }) => p.full_name || p.email

type SummaryRow = Awaited<ReturnType<typeof loadRekap>>['rows'][number]

/** Ringkasan periode (satu baris per orang). Dipakai export rekap HR dan tracker pribadi. */
export const summaryColumns: ExcelColumn<SummaryRow>[] = [
  { header: 'Nama', width: 22, value: (r) => name(r.p) },
  { header: 'Divisi', width: 14, value: (r) => r.p.division },
  { header: 'Jabatan', width: 20, value: (r) => r.p.position_title },
  { header: 'Total Jam Kerja (Periode)', width: 11, format: '0.00', value: (r) => r.s.totalHours },
  { header: 'Target Jam', width: 9, format: '0.00', value: (r) => r.s.targetHours },
  { header: 'Efektivitas (%)', width: 11, format: '0.00', value: (r) => r.s.effectiveness },
  { header: 'Jumlah Aktivitas', width: 10, value: (r) => r.s.activities },
  { header: 'Hari Aktif Kerja', width: 9, value: (r) => r.s.activeDays },
  { header: 'Hari Tidak Aktif Kerja', width: 10, value: (r) => Math.max(r.s.workdays - r.s.activeDays, 0) },
  { header: 'Rata-rata Jam/Hari', width: 10, format: '0.00', value: (r) => r.s.avgHoursPerActiveDay },
  { header: 'Rata-rata Durasi Aktivitas (Jam)', width: 12, format: '0.00', value: (r) => r.s.avgHoursPerActivity },
  { header: 'Cuti (hari)', width: 8, value: (r) => r.l.CUTI },
  { header: 'Izin (hari)', width: 8, value: (r) => r.l.IZIN },
  { header: 'Sakit (hari)', width: 8, value: (r) => r.l.SAKIT },
  { header: 'Status', width: 16, value: (r) => STATUS_LABEL[r.s.status] },
]
