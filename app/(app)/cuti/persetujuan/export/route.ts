import { redirect } from 'next/navigation'
import type { NextRequest } from 'next/server'
import { requireProfile } from '@/lib/auth/session'
import { canApproveLeave } from '@/lib/auth/current-access'
import { loadLeave, loadLeaveTypes } from '@/lib/hr/data'
import { leaveColumns } from '@/lib/hr/leave-export'
import { parseMonth } from '@/lib/hr/rekap'
import { monthRange } from '@/lib/hr/tracker'
import { exportInfo } from '@/lib/export/excel'
import { exportResponse } from '@/lib/export'
import { onlySelected, selectedIds } from '@/lib/bulk'

export const dynamic = 'force-dynamic'

/** Persetujuan cuti: pengajuan menunggu + semua pengajuan ?bulan=YYYY-MM. Izin leave.approve atau hr.manage (sama dengan halamannya). */
export async function GET(request: NextRequest) {
  const profile = await requireProfile()
  if (!(await canApproveLeave(profile.id))) redirect('/dashboard?denied=1')
  const month = parseMonth(request.nextUrl.searchParams.get('bulan'))
  const [from, to] = monthRange(month)
  const [allPending, allMonth, types] = await Promise.all([
    loadLeave({ from: '2000-01-01', to: '2100-12-31', statuses: ['PENDING'] }),
    loadLeave({ from, to }),
    loadLeaveTypes(),
  ])
  const picked = selectedIds(request.nextUrl.searchParams)
  const pending = onlySelected(allPending, picked)
  const monthRows = onlySelected(allMonth, picked)
  const info = exportInfo(profile.full_name || profile.email, [`Bulan: ${month}`, ...(picked ? ['Hanya baris terpilih'] : [])])
  return exportResponse(request, `Pengajuan Cuti ${month}`, [
    { name: 'Menunggu Persetujuan', title: 'PENGAJUAN MENUNGGU PERSETUJUAN', info, columns: await leaveColumns(pending, types), rows: pending },
    { name: 'Semua Pengajuan', title: `SEMUA PENGAJUAN ${month}`, info, columns: await leaveColumns(monthRows, types), rows: monthRows },
  ])
}
