import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import type { LeaveRecord } from '@/lib/hr/data'
import { KIND_LABEL, STATUS_LABEL } from '@/lib/hr/leave'
import { excelDate, type ExcelColumn } from '@/lib/export/excel'

type Person = { id: string; full_name: string | null; email: string; division: string | null }

/** Kolom daftar pengajuan cuti/izin/sakit; nama & divisi diambil dari profil pemohon dan pemutus. */
export async function leaveColumns(rows: LeaveRecord[]): Promise<ExcelColumn<LeaveRecord>[]> {
  const ids = [...new Set(rows.flatMap((r) => [r.user_id, r.decided_by].filter((x): x is string => !!x)))]
  const { data } = ids.length
    ? await createAdminClient().from('profiles').select('id, full_name, email, division').in('id', ids)
    : { data: [] }
  const byId = new Map(((data ?? []) as Person[]).map((p) => [p.id, p]))
  const name = (id: string | null) => (id ? byId.get(id)?.full_name || byId.get(id)?.email || null : null)
  return [
    { header: 'Nama', width: 22, value: (r) => name(r.user_id) },
    { header: 'Divisi', width: 14, value: (r) => byId.get(r.user_id)?.division },
    { header: 'Jenis', width: 9, value: (r) => KIND_LABEL[r.kind] },
    { header: 'Mulai', width: 12, value: (r) => excelDate(r.start_date) },
    { header: 'Selesai', width: 12, value: (r) => excelDate(r.end_date) },
    { header: 'Hari Kerja', width: 9, value: (r) => r.days },
    { header: 'Alasan', width: 36, value: (r) => r.reason },
    { header: 'Status', width: 20, value: (r) => STATUS_LABEL[r.status] },
    { header: 'Diputuskan Oleh', width: 22, value: (r) => name(r.decided_by) },
    { header: 'Tanggal Keputusan', width: 14, value: (r) => excelDate(r.decided_at) },
    { header: 'Catatan Keputusan', width: 30, value: (r) => r.decision_note },
    { header: 'Diajukan', width: 12, value: (r) => excelDate(r.created_at) },
  ]
}
