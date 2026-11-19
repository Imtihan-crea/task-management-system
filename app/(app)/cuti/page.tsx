import { requireProfile } from '@/lib/auth/session'
import { canApproveLeave } from '@/lib/auth/current-access'
import { createAdminClient } from '@/lib/supabase/admin'
import { ExportLink } from '@/components/export/ExportLink'
import { AppShell } from '@/components/layout/AppShell'
import { ButtonLink, KpiCard, PageHeader } from '@/components/ui/primitives'
import { CancelOwnLeaveButton, LeaveRequestForm } from '@/components/leave/LeaveForms'
import { LeaveTable } from '@/components/leave/LeaveTable'
import { LeaveGuide } from '@/components/leave/LeaveGuide'
import { loadCalendar, loadLeave, loadLeaveTypes, loadRules } from '@/lib/hr/data'
import { activeTypes, annualBalance, jointQuotaDays, kindLabels } from '@/lib/hr/leave'
import { todayISO } from '@/lib/utils/dates'
import { BulkBar, BulkSelectProvider } from '@/components/ui/BulkSelect'
import { bulkCancelOwnLeave } from '@/app/actions/leave'

/** Cuti milik sendiri: ajukan, lihat status, saldo cuti tahunan, panduan jenis cuti. */
export default async function LeavePage() {
  const profile = await requireProfile()
  const today = todayISO()
  const year = today.slice(0, 4)
  const [rows, calendar, quotaRes, isApprover, types, rules] = await Promise.all([
    loadLeave({ from: `${Number(year) - 1}-01-01`, to: `${Number(year) + 1}-12-31`, userId: profile.id }),
    loadCalendar(`${year}-01-01`, `${year}-12-31`),
    createAdminClient().from('profiles').select('annual_leave_quota').eq('id', profile.id).single<{ annual_leave_quota: number | null }>(),
    canApproveLeave(profile.id),
    loadLeaveTypes(),
    loadRules(today),
  ])
  const balance = annualBalance(quotaRes.data?.annual_leave_quota ?? null, rows, year, calendar, jointQuotaDays(calendar, rules.jointLeaveUsesQuota), types)
  const quotaNames = types.filter((t) => t.uses_quota && !t.archived_at).map((t) => t.label)

  return (
    <AppShell>
      <PageHeader
        title="Cuti"
        subtitle="Ajukan dari sini; penyetuju akan menerima notifikasi."
        actions={
          <>
            {isApprover && <ButtonLink href="/cuti/persetujuan" variant="secondary">Persetujuan</ButtonLink>}
            <ExportLink href="/cuti/export" />
          </>
        }
      />
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 [&>:last-child]:col-span-2 sm:[&>:last-child]:col-span-1">
        <KpiCard label={`Hak cuti tahunan ${year}`} value={balance.quota ?? 'Belum diisi HR'} />
        <KpiCard label="Jatah terpakai" value={balance.taken} />
        <KpiCard label={`Cuti bersama (${rules.jointLeaveUsesQuota ? 'memotong' : 'tidak memotong'})`} value={balance.joint} />
        <KpiCard label="Cuti menunggu persetujuan" value={balance.pending} />
        <KpiCard label="Sisa cuti" value={balance.remaining ?? '-'} />
      </div>
      <section className="mt-6 rounded-2xl bg-white p-4 shadow-sm sm:p-5 dark:bg-zinc-900">
        <h2 className="mb-1 text-lg font-bold">Ajukan</h2>
        <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-400">Hanya hari kerja yang dihitung (akhir pekan dan libur di kalender tidak). {quotaNames.length ? `Yang memotong saldo: ${quotaNames.join(', ')}${rules.jointLeaveUsesQuota ? ' dan cuti bersama' : ''}.` : rules.jointLeaveUsesQuota ? 'Hanya cuti bersama yang memotong saldo.' : 'Tidak ada jenis yang memotong saldo.'} Baca panduan di bawah sebelum memilih jenis.</p>
        <LeaveRequestForm today={today} types={activeTypes(types).map((t) => ({ code: t.code, label: t.label, description: t.description, max_days: t.max_days }))} />
      </section>
      <section className="mt-6 rounded-2xl bg-white p-4 shadow-sm sm:p-5 dark:bg-zinc-900">
        <h2 className="mb-3 text-lg font-bold">Pengajuan saya</h2>
        <BulkSelectProvider ids={rows.map((l) => l.id)}>
          <BulkBar
            noun="pengajuan"
            actions={[{ key: 'cancel', label: 'Batalkan yang menunggu', run: bulkCancelOwnLeave, danger: true }]}
            exportHref="/cuti/export"
          />
          <LeaveTable rows={rows} labels={kindLabels(types)} selectable={() => true} actions={(l) => (l.status === 'PENDING' ? <CancelOwnLeaveButton id={l.id} /> : null)} />
        </BulkSelectProvider>
      </section>
      <LeaveGuide types={activeTypes(types)} jointUsesQuota={rules.jointLeaveUsesQuota} />
    </AppShell>
  )
}
