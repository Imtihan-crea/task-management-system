import type { NextRequest } from 'next/server'
import { requireProfile } from '@/lib/auth/session'
import { canViewClients } from '@/lib/auth/current-access'
import { loadLeads, loadNames, sanitizeLeadSearch, type Lead } from '@/lib/clients/data'
import { STAGE_LABEL, rupiah } from '@/lib/clients/pipeline'
import { excelDate, excelResponse, exportInfo, type ExcelColumn } from '@/lib/export/excel'
import { todayISO } from '@/lib/utils/dates'

export const dynamic = 'force-dynamic'

/** Daftar lead -> Excel. Filter sama dengan halaman /clients; wajib izin clients.view (memuat data kontak). */
export async function GET(request: NextRequest) {
  const profile = await requireProfile()
  if (!(await canViewClients(profile.id))) return new Response('Forbidden', { status: 403 })
  const sp = request.nextUrl.searchParams
  const f = { stage: sp.get('stage') ?? '', pic: sp.get('pic') ?? '', q: sanitizeLeadSearch(sp.get('q') ?? '') }
  const rows = await loadLeads(f)
  const names = await loadNames(rows.map((r) => r.owner_id))

  const columns: ExcelColumn<Lead>[] = [
    { header: 'Perusahaan', width: 30, value: (l) => l.company_name },
    { header: 'Tahap', width: 14, value: (l) => STAGE_LABEL[l.stage] },
    { header: 'Perkiraan Nilai (Rp)', width: 18, format: '#,##0', value: (l) => l.estimated_value },
    { header: 'PIC', width: 22, value: (l) => (l.owner_id ? names[l.owner_id] : null) },
    { header: 'Nama Kontak', width: 22, value: (l) => l.contact_name },
    { header: 'Email Kontak', width: 28, value: (l) => l.contact_email },
    { header: 'Telepon Kontak', width: 18, value: (l) => l.contact_phone },
    { header: 'Sumber', width: 18, value: (l) => l.source },
    { header: 'Alasan Batal', width: 30, value: (l) => l.lost_reason },
    { header: 'Catatan', width: 40, value: (l) => l.notes },
    { header: 'Dibuat', width: 12, value: (l) => excelDate(l.created_at) },
    { header: 'Diubah', width: 12, value: (l) => excelDate(l.updated_at) },
  ]
  const total = rows.reduce((a, r) => a + r.estimated_value, 0)
  const info = exportInfo(profile.full_name || profile.email, [
    `${rows.length} lead, total ${rupiah(total)}`,
    ...(f.stage ? [`Tahap: ${STAGE_LABEL[f.stage as keyof typeof STAGE_LABEL] ?? f.stage}`] : []),
    ...(f.q ? [`Cari: ${f.q}`] : []),
  ])
  return excelResponse(`Client Management ${todayISO()}`, [{ name: 'Lead', title: 'DAFTAR LEAD CLIENT MANAGEMENT', info, columns, rows }])
}
