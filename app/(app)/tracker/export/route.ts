import type { NextRequest } from 'next/server'
import { requireProfile } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { loadLeave, loadLeaveTypes, loadPeriodBasis, loadReviewLogs, loadRules } from '@/lib/hr/data'
import { dailyDataColumns, summaryColumns } from '@/lib/hr/export-columns'
import { columnTypes, leaveDaysIn, paidLeaveDays, type LeaveRow } from '@/lib/hr/leave'
import { parsePeriod, periodSummary } from '@/lib/hr/period'
import { todayISO } from '@/lib/utils/dates'
import { exportInfo } from '@/lib/export/excel'
import { exportResponse } from '@/lib/export'

export const dynamic = 'force-dynamic'

/** Daily Tracker milik sendiri untuk periode terpilih (?periode=minggu|bulan|rentang, ?bulan= lama tetap jalan). Tanpa izin khusus: hanya data akun yang login. */
export async function GET(request: NextRequest) {
  const profile = await requireProfile()
  const sp = request.nextUrl.searchParams
  const { period, error } = parsePeriod(
    { periode: sp.get('periode'), minggu: sp.get('minggu'), bulan: sp.get('bulan'), dari: sp.get('dari'), sampai: sp.get('sampai') },
    todayISO()
  )
  if (error) return new Response(error, { status: 400 })
  const { from, to } = period
  const label = period.fileLabel
  const [logs, basis, rules, leave, leaveTypes, me] = await Promise.all([
    loadReviewLogs({ userId: profile.id, from, to }),
    loadPeriodBasis(from, to, period.month),
    loadRules(to),
    loadLeave({ from, to, userId: profile.id, statuses: ['APPROVED'] }),
    loadLeaveTypes(),
    createAdminClient().from('profiles').select('division, position_title').eq('id', profile.id).single<{ division: string | null; position_title: string | null }>(),
  ])
  const by = profile.full_name || profile.email
  const division = me.data?.division ?? null
  const l = leaveDaysIn(leave as LeaveRow[], from, to, basis.calendar)
  const logRows = logs.map((x) => ({ user_id: x.user_id, work_date: x.work_date, project_name: x.project, category: x.category, duration_minutes: x.duration_minutes, client: x.client }))
  const s = periodSummary(period, logRows, basis.workdays.length, rules, basis.lockedTarget, paidLeaveDays(l, leaveTypes))
  const sorted = [...logs].sort((a, b) => a.work_date.localeCompare(b.work_date) || a.start_time.localeCompare(b.start_time))
  const info = exportInfo(by, [`Periode: ${period.label} · Nama: ${by}`])
  return exportResponse(request, `Daily Tracker ${by} ${label}`, [
    {
      name: 'Monthly Summary',
      title: `MONTHLY SUMMARY ${label}`,
      info,
      columns: summaryColumns(columnTypes(leaveTypes, [l])),
      rows: [{ p: { id: profile.id, full_name: profile.full_name, email: profile.email, division, position_title: me.data?.position_title ?? null }, l, s }],
    },
    { name: 'Daily Data', title: `DAILY DATA ${label}`, info, columns: dailyDataColumns(() => division), rows: sorted },
  ])
}
