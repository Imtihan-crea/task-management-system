import Link from 'next/link'
import { requireProfile } from '@/lib/auth/session'
import { canApproveLeave } from '@/lib/auth/current-access'
import { createAdminClient } from '@/lib/supabase/admin'
import { ExportLink } from '@/components/export/ExportLink'
import { AppShell } from '@/components/layout/AppShell'
import { KpiCard, PageHeader } from '@/components/ui/primitives'
import { CancelOwnLeaveButton, LeaveRequestForm } from '@/components/leave/LeaveForms'
import { LeaveTable } from '@/components/leave/LeaveTable'
import { LeaveGuide } from '@/components/leave/LeaveGuide'
import { loadCalendar, loadLeave } from '@/lib/hr/data'
import { annualBalance, jointLeaveDays } from '@/lib/hr/leave'
import { todayISO } from '@/lib/utils/dates'

/** Cuti milik sendiri: ajukan, lihat status, saldo cuti tahunan, panduan jenis cuti. */
export default async function LeavePage() {
  const profile = await requireProfile()
  const today = todayISO()
  const year = today.slice(0, 4)
  const [rows, calendar, quotaRes, isApprover] = await Promise.all([
    loadLeave({ from: `${Number(year) - 1}-01-01`, to: `${Number(year) + 1}-12-31`, userId: profile.id }),
    loadCalendar(`${year}-01-01`, `${year}-12-31`),
    createAdminClient().from('profiles').select('annual_leave_quota').eq('id', profile.id).single<{ annual_leave_quota: number | null }>(),
    canApproveLeave(profile.id),
  ])
  const balance = annualBalance(quotaRes.data?.annual_leave_quota ?? null, rows, year, calendar, jointLeaveDays(calendar))

  return (
    <AppShell>
      <PageHeader
        title="Cuti"
        subtitle="Ajukan dari sini; penyetuju akan menerima notifikasi."
        actions={
          <div className="flex flex-wrap items-center gap-3">
            {isApprover && <Link href="/cuti/persetujuan" className="text-sm font-semibold text-kasuat-deep-gold hover:underline">Persetujuan</Link>}
            <ExportLink href="/cuti/export" />
          </div>
        }
      />
      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <KpiCard label={`Hak cuti tahunan ${year}`} value={balance.quota ?? 'Belum diisi HR'} />
        <KpiCard label="Cuti tahunan diambil" value={balance.taken} />
        <KpiCard label="Cuti bersama (memotong)" value={balance.joint} />
        <KpiCard label="Cuti menunggu persetujuan" value={balance.pending} />
        <KpiCard label="Sisa cuti" value={balance.remaining ?? '-'} />
      </div>
      <section className="mt-6 rounded-2xl bg-white p-5 shadow dark:bg-zinc-900">
        <h2 className="mb-1 text-lg font-bold">Ajukan</h2>
        <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-400">Hanya hari kerja yang dihitung (akhir pekan dan libur di kalender tidak). Hanya Cuti Tahunan dan cuti bersama yang memotong saldo. Baca panduan di bawah sebelum memilih jenis.</p>
        <LeaveRequestForm today={today} />
      </section>
      <section className="mt-6 rounded-2xl bg-white p-5 shadow dark:bg-zinc-900">
        <h2 className="mb-3 text-lg font-bold">Pengajuan saya</h2>
        <LeaveTable
          rows={rows}
          actions={(l) => (
            <div className="flex flex-col gap-1">
              {l.status === 'PENDING' && <CancelOwnLeaveButton id={l.id} />}
              {(l.status === 'PENDING' || l.status === 'APPROVED') && l.end_date >= today && (
                <Link href={`/tasks/alih?cuti=${l.id}`} className="inline-flex min-h-[44px] items-center text-sm font-semibold underline">
                  Alih task selama cuti
                </Link>
              )}
            </div>
          )}
        />
      </section>
      <LeaveGuide />
    </AppShell>
  )
}
