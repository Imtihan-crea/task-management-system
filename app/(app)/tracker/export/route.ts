import type { NextRequest } from 'next/server'
import { requireProfile } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { loadLeave, loadMonthBasis, loadReviewLogs, loadRules } from '@/lib/hr/data'
import { dailyDataColumns, summaryColumns } from '@/lib/hr/export-columns'
import { leaveDaysIn, type LeaveRow } from '@/lib/hr/leave'
import { parseMonth } from '@/lib/hr/rekap'
import { monthRange, monthlySummary } from '@/lib/hr/tracker'
import { excelResponse, exportInfo } from '@/lib/export/excel'

export const dynamic = 'force-dynamic'

/** Daily Tracker milik sendiri sebulan (?bulan=YYYY-MM). Tanpa izin khusus: hanya data akun yang login. */
export async function GET(request: NextRequest) {
  const profile = await requireProfile()
  const month = parseMonth(request.nextUrl.searchParams.get('bulan'))
  const [from, to] = monthRange(month)
  const [logs, basis, rules, leave, me] = await Promise.all([
    loadReviewLogs({ userId: profile.id, from, to }),
    loadMonthBasis(month),
    loadRules(to),
    loadLeave({ from, to, userId: profile.id, statuses: ['APPROVED'] }),
    createAdminClient().from('profiles').select('division, position_title').eq('id', profile.id).single<{ division: string | null; position_title: string | null }>(),
  ])
  const by = profile.full_name || profile.email
  const division = me.data?.division ?? null
  const l = leaveDaysIn(leave as LeaveRow[], from, to, basis.calendar)
  const s = monthlySummary(
    logs.map((x) => ({ user_id: x.user_id, work_date: x.work_date, project_name: x.project, category: x.category, duration_minutes: x.duration_minutes })),
    basis.workdays.length, rules, basis.lockedTarget, l.CUTI + l.IZIN + l.SAKIT)
  const sorted = [...logs].sort((a, b) => a.work_date.localeCompare(b.work_date) || a.start_time.localeCompare(b.start_time))
  const info = exportInfo(by, [`Bulan: ${month} · Nama: ${by}`])
  return excelResponse(`Daily Tracker ${by} ${month}`, [
    {
      name: 'Monthly Summary',
      title: `MONTHLY SUMMARY ${month}`,
      info,
      columns: summaryColumns,
      rows: [{ p: { id: profile.id, full_name: profile.full_name, email: profile.email, division, position_title: me.data?.position_title ?? null }, l, s }],
    },
    { name: 'Daily Data', title: `DAILY DATA ${month}`, info, columns: dailyDataColumns(() => division), rows: sorted },
  ])
}
