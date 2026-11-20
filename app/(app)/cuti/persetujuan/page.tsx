import { redirect } from 'next/navigation'
import { requireProfile } from '@/lib/auth/session'
import { canApproveLeave, permissionProjects } from '@/lib/auth/current-access'
import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import { ExportLink } from '@/components/export/ExportLink'
import { AppShell } from '@/components/layout/AppShell'
import { PageHeader } from '@/components/ui/primitives'
import { DecideLeaveForm } from '@/components/leave/LeaveForms'
import { LeaveTable } from '@/components/leave/LeaveTable'
import { loadCalendar, loadLeave } from '@/lib/hr/data'
import { annualBalance, type LeaveRow } from '@/lib/hr/leave'
import { monthRange } from '@/lib/hr/tracker'
import { todayISO } from '@/lib/utils/dates'

const INPUT = 'rounded-lg border px-3 py-2 text-base dark:border-zinc-700 dark:bg-zinc-800'

/** Persetujuan cuti / izin / sakit + saldo cuti semua karyawan. Izin leave.approve atau hr.manage. */
export default async function LeaveApprovalPage({ searchParams }: { searchParams: Promise<{ bulan?: string }> }) {
  const profile = await requireProfile()
  if (!(await canApproveLeave(profile.id))) redirect('/dashboard?denied=1')
  const sp = await searchParams
  const today = todayISO()
  const year = today.slice(0, 4)
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.bulan ?? '') ? sp.bulan! : today.slice(0, 7)
  const [from, to] = monthRange(month)

  const [pending, monthRows, yearRows, calendar, peopleRes, taskScope] = await Promise.all([
    loadLeave({ from: '2000-01-01', to: '2100-12-31', statuses: ['PENDING'] }),
    loadLeave({ from, to }),
    loadLeave({ from: `${year}-01-01`, to: `${year}-12-31`, statuses: ['APPROVED', 'PENDING'] }),
    loadCalendar(`${year}-01-01`, `${year}-12-31`),
    createAdminClient().from('profiles').select('id, full_name, email, annual_leave_quota, tracker_required, status').is('deleted_at', null).order('full_name'),
    permissionProjects(profile.id, 'tasks.edit'),
  ])
  // Alih task selama cuti: hanya untuk yang bisa mengalihkan task (PM/Admin).
  const canTransfer = taskScope.all || taskScope.include.length > 0
  const transferLink = (l: { id: string; status: string; end_date: string; user_id: string }) =>
    canTransfer && l.status === 'APPROVED' && l.end_date >= today && l.user_id !== profile.id ? (
      <Link href={`/tasks/alih?cuti=${l.id}`} className="inline-flex min-h-[44px] items-center text-sm font-semibold underline">
        Alih task
      </Link>
    ) : null
  type Person = { id: string; full_name: string | null; email: string; annual_leave_quota: number | null; tracker_required: boolean; status: string }
  const people = (peopleRes.data ?? []) as Person[]
  const name = new Map(people.map((p) => [p.id, p.full_name || p.email]))
  const person = (l: { user_id: string }) => name.get(l.user_id) ?? '-'
  const balances = people
    .filter((p) => p.status === 'ACTIVE' && (p.tracker_required || p.annual_leave_quota !== null))
    .map((p) => ({ p, b: annualBalance(p.annual_leave_quota, yearRows.filter((r) => r.user_id === p.id) as LeaveRow[], year, calendar) }))

  return (
    <AppShell>
      <PageHeader
        title="Persetujuan Cuti"
        subtitle="Pengajuan sendiri harus diputuskan penyetuju lain."
        actions={<ExportLink href={`/cuti/persetujuan/export?bulan=${month}`} />}
      />

      <section className="mt-6 rounded-2xl bg-white p-5 shadow dark:bg-zinc-900">
        <h2 className="mb-3 text-lg font-bold">Menunggu persetujuan ({pending.length})</h2>
        <LeaveTable rows={pending} person={person} empty="Tidak ada pengajuan yang menunggu." actions={(l) => (l.user_id === profile.id ? null : <DecideLeaveForm id={l.id} mode="pending" />)} />
      </section>

      <section className="mt-6 rounded-2xl bg-white p-5 shadow dark:bg-zinc-900">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-lg font-bold">Semua pengajuan {month}</h2>
          <form className="flex items-end gap-2">
            <label htmlFor="bulan" className="sr-only">Bulan</label>
            <input id="bulan" name="bulan" type="month" defaultValue={month} className={INPUT} />
            <button type="submit" className="min-h-[44px] rounded-lg border px-3 py-2 text-sm font-semibold dark:border-zinc-700">Tampilkan</button>
          </form>
        </div>
        <LeaveTable
          rows={monthRows}
          person={person}
          actions={(l) =>
            l.status === 'APPROVED' && l.user_id !== profile.id ? (
              <div className="flex flex-col gap-1">
                <DecideLeaveForm id={l.id} mode="approved" />
                {transferLink(l)}
              </div>
            ) : null
          }
        />
      </section>

      <section className="mt-6 rounded-2xl bg-white p-5 shadow dark:bg-zinc-900">
        <h2 className="mb-1 text-lg font-bold">Saldo cuti tahunan {year}</h2>
        <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-400">Hak cuti diisi HR di Data Karyawan (detail user). Sisa = hak − cuti disetujui tahun ini.</p>
        <div className="relative overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-zinc-600 dark:text-zinc-400">
                <th className="py-2 pr-3">Nama</th>
                <th className="py-2 pr-3 text-right">Hak</th>
                <th className="py-2 pr-3 text-right">Diambil</th>
                <th className="py-2 pr-3 text-right">Menunggu</th>
                <th className="py-2 text-right">Sisa</th>
              </tr>
            </thead>
            <tbody>
              {balances.map(({ p, b }) => (
                <tr key={p.id} className="border-b last:border-0">
                  <td className="py-2 pr-3">{p.full_name || p.email}</td>
                  <td className="py-2 pr-3 text-right">{b.quota ?? '-'}</td>
                  <td className="py-2 pr-3 text-right">{b.taken}</td>
                  <td className="py-2 pr-3 text-right">{b.pending}</td>
                  <td className={`py-2 text-right font-semibold ${b.remaining !== null && b.remaining < 0 ? 'text-red-700' : ''}`}>{b.remaining ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </AppShell>
  )
}
