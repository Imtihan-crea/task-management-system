import type { NextRequest } from 'next/server'
import { requireProfile } from '@/lib/auth/session'
import { loadLeave } from '@/lib/hr/data'
import { leaveColumns } from '@/lib/hr/leave-export'
import { exportInfo } from '@/lib/export/excel'
import { exportResponse } from '@/lib/export'
import { todayISO } from '@/lib/utils/dates'

export const dynamic = 'force-dynamic'

/** Pengajuan cuti/izin/sakit milik sendiri (rentang sama dengan halaman /cuti). Tanpa izin khusus: hanya data sendiri. */
export async function GET(request: NextRequest) {
  const profile = await requireProfile()
  const year = todayISO().slice(0, 4)
  const rows = await loadLeave({ from: `${Number(year) - 1}-01-01`, to: `${Number(year) + 1}-12-31`, userId: profile.id })
  const by = profile.full_name || profile.email
  return exportResponse(request, `Pengajuan Cuti Izin Sakit ${by}`, [
    {
      name: 'Pengajuan',
      title: `PENGAJUAN CUTI, IZIN & SAKIT - ${by.toUpperCase()}`,
      info: exportInfo(by, [`Periode: ${Number(year) - 1}-${Number(year) + 1}`]),
      columns: await leaveColumns(rows),
      rows,
    },
  ])
}
