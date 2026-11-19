import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { loadLeave, loadLeaveTypes, loadLogs, loadPeriodBasis, loadRules } from '@/lib/hr/data'
import { columnTypes, leaveDaysIn, paidLeaveDays, type LeaveRow } from '@/lib/hr/leave'
import { periodSummary, type Period } from '@/lib/hr/period'
import type { LogRow } from '@/lib/hr/tracker'
import { todayISO } from '@/lib/utils/dates'

export type RekapPerson = { id: string; full_name: string | null; email: string; division: string | null; position_title: string | null }

/** Bulan dari query (?bulan=YYYY-MM); selain itu bulan ini. */
export const parseMonth = (bulan: string | null | undefined) =>
  /^\d{4}-(0[1-9]|1[0-2])$/.test(bulan ?? '') ? bulan! : todayISO().slice(0, 7)

/** Data Rekap Daily Tracker untuk satu periode (halaman dan export memakai yang sama). */
export async function loadRekap(period: Period, divisi?: string | null) {
  const { from, to } = period
  const [peopleRes, logs, basis, rules, leave, leaveTypes] = await Promise.all([
    createAdminClient()
      .from('profiles')
      .select('id, full_name, email, division, position_title')
      .eq('status', 'ACTIVE')
      .order('full_name'),
    loadLogs(from, to),
    loadPeriodBasis(from, to, period.month),
    loadRules(to),
    loadLeave({ from, to, statuses: ['APPROVED'] }),
    loadLeaveTypes(),
  ])
  const everyone = (peopleRes.data ?? []) as RekapPerson[]
  const divisions = [...new Set(everyone.map((p) => p.division).filter((d): d is string => !!d))].sort()
  const people = divisi ? everyone.filter((p) => p.division === divisi) : everyone
  const byUser = new Map<string, LogRow[]>()
  for (const l of logs) byUser.set(l.user_id, [...(byUser.get(l.user_id) ?? []), l])
  const rows = people.map((p) => {
    const l = leaveDaysIn(leave.filter((x) => x.user_id === p.id) as LeaveRow[], from, to, basis.calendar)
    return { p, l, s: periodSummary(period, byUser.get(p.id) ?? [], basis.workdays.length, rules, basis.lockedTarget, paidLeaveDays(l, leaveTypes)) }
  })
  return { from, to, everyone, divisions, people, byUser, rows, basis, rules, leaveColumns: columnTypes(leaveTypes, rows.map((r) => r.l)) }
}
