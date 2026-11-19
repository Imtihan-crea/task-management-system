import { Suspense } from 'react'
import { requireProfile } from '@/lib/auth/session'
import { can } from '@/lib/auth/permissions'
import { getMeetingScope } from '@/lib/data/meetings'
import { AppShell } from '@/components/layout/AppShell'
import { ButtonLink, PageHeader } from '@/components/ui/primitives'
import { SkeletonCards, SkeletonRows, SkeletonTable } from '@/components/ui/Skeleton'
import { MeetingFilterForm } from '@/components/meetings/MeetingFilterForm'
import { MeetingKpis } from '@/components/meetings/MeetingKpis'
import { MeetingResults } from '@/components/meetings/MeetingResults'
import { MeetingTabs } from '@/components/meetings/MeetingTabs'
import { parseMeetingFilters } from '@/lib/meetings/filters'
import { ExportLink } from '@/components/export/ExportLink'

export default async function MeetingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const profile = await requireProfile()
  const canCreate = can(profile.role, 'meetings.create')

  const params = await searchParams
  const str = (v: string | string[] | undefined) => (typeof v === 'string' ? v : '')

  const filters = parseMeetingFilters((k) => str(params[k]))
  const tab = filters.tab

  // Param URL yang dipertahankan saat pindah tab (tanpa `tab`).
  const tabBase: Record<string, string> = {}
  if (filters.q) tabBase.q = filters.q
  if (filters.project) tabBase.project = filters.project
  if (filters.type) tabBase.type = filters.type
  if (filters.status) tabBase.status = filters.status
  if (filters.organizer) tabBase.organizer = filters.organizer
  if (filters.dateFrom) tabBase.from = filters.dateFrom
  if (filters.dateTo) tabBase.to = filters.dateTo

  const exportParams = new URLSearchParams(tabBase)
  exportParams.set('tab', tab)

  const resultsKey = JSON.stringify({ ...filters, user: profile.id })
  const scope = await getMeetingScope(profile.id, profile.role)

  return (
    <AppShell>
      <PageHeader
        title="Meetings"
        subtitle="Pusat kontrol operasional untuk semua meeting."
        actions={
          <>
            {canCreate && <ButtonLink href="/meetings/new">+ Buat Meeting</ButtonLink>}
            <ExportLink href={`/meetings/export?${exportParams}`} />
          </>
        }
      />

      {/* KPI: boundary sendiri */}
      <Suspense fallback={<SkeletonCards count={4} />}>
        <MeetingKpis scope={scope} filters={filters} />
      </Suspense>

      {/* Tab: boundary sendiri */}
      <div className="mt-4">
        <Suspense
          fallback={<div className="h-10 animate-pulse rounded-lg bg-zinc-100 dark:bg-zinc-800" />}
        >
          <MeetingTabs scope={scope} tab={tab} filters={filters} baseParams={tabBase} />
        </Suspense>
      </div>

      {/* Filter: boundary sendiri */}
      <Suspense
        fallback={
          <div className="mt-4 h-40 animate-pulse rounded-2xl bg-white shadow dark:bg-zinc-900" />
        }
      >
        <MeetingFilterForm filters={filters} />
      </Suspense>

      {/* Hasil: hanya area ini yang loading saat tab/filter berubah */}
      <Suspense
        key={resultsKey}
        fallback={
          <div className="mt-4">
            <div className="md:hidden">
              <SkeletonRows rows={4} />
            </div>
            <SkeletonTable rows={6} />
          </div>
        }
      >
        <div className="mt-1">
          <MeetingResults scope={scope} filters={filters} />
        </div>
      </Suspense>
    </AppShell>
  )
}