import { redirect } from 'next/navigation'
import { PORTAL_ENABLED } from '@/lib/portal/flag'
import Link from 'next/link'
import { requireProfile } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { canApproveLeave, loadAccess, menuPermissions } from '@/lib/auth/current-access'
import { roleLabel } from '@/lib/auth/roles'
import { AppShell } from '@/components/layout/AppShell'
import { NAV_ICONS, NavIcon } from '@/components/layout/nav-icons'
import { visibleApps, visibleItems } from '@/lib/portal/apps'

/** Ringkasan kecil per kartu; hanya hitungan murah (head count). */
async function summaries(userId: string, apps: string[]): Promise<Record<string, string>> {
  const admin = createAdminClient()
  const out: Record<string, string> = {}
  const jobs: Promise<void>[] = []
  if (apps.includes('project')) {
    jobs.push(
      (async () => {
        const { count } = await admin
          .from('tasks')
          .select('id', { count: 'exact', head: true })
          .eq('assignee_id', userId)
          .eq('is_deleted', false)
          .not('status', 'in', '(DONE,CANCELLED)')
        if (count !== null) out.project = `${count} task terbuka milik Anda`
      })()
    )
  }
  if (apps.includes('cuti')) {
    jobs.push(
      (async () => {
        const approver = await canApproveLeave(userId)
        let q = admin.from('leave_requests').select('id', { count: 'exact', head: true }).eq('status', 'PENDING')
        if (!approver) q = q.eq('user_id', userId)
        const { count } = await q
        if (count !== null) out.cuti = approver ? `${count} pengajuan menunggu persetujuan` : `${count} pengajuan Anda menunggu`
      })()
    )
  }
  await Promise.all(jobs)
  return out
}

export default async function PortalPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  if (!PORTAL_ENABLED) redirect('/dashboard')
  const profile = await requireProfile()
  const params = await searchParams
  const [allowed, access] = await Promise.all([menuPermissions(profile.id), loadAccess(profile.id)])
  const apps = visibleApps(allowed)
  const notes = await summaries(profile.id, apps.map((a) => a.key))
  const label = roleLabel({ role: profile.role, is_super_admin: access.isSuperAdmin, is_developer: access.isDeveloper })

  return (
    <AppShell>
      {params.denied === '1' && (
        <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm font-medium text-red-700 dark:bg-red-950 dark:text-red-300">
          Anda tidak punya izin untuk membuka halaman itu.
        </p>
      )}

      <h1 className="font-heading text-xl font-bold">Halo, {profile.full_name || profile.email}</h1>
      <p className="mt-0.5 text-sm text-zinc-600 dark:text-zinc-400">
        Masuk sebagai <span className="font-semibold text-kasuat-black dark:text-zinc-100">{label}</span>. Pilih aplikasi
        yang ingin dibuka.
      </p>

      <h2 className="mt-6 text-sm font-semibold uppercase tracking-wider text-zinc-600 dark:text-zinc-400">Aplikasi</h2>
      <ul className="mt-2 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {apps.map((app) => {
          const items = visibleItems(app, allowed)
          return (
            <li key={app.key}>
              <Link
                href={items[0].href}
                className="flex h-full min-h-[44px] flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm transition-colors hover:border-kasuat-gold focus-visible:border-kasuat-gold dark:border-zinc-800 dark:bg-zinc-900"
              >
                <span className="flex items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-kasuat-black text-kasuat-gold">
                    <NavIcon d={NAV_ICONS[items[0].href] ?? ''} />
                  </span>
                  <span className="min-w-0">
                    <span className="block font-heading text-base font-bold">{app.title}</span>
                    {notes[app.key] && (
                      <span className="block text-sm font-medium text-kasuat-deep-gold">{notes[app.key]}</span>
                    )}
                  </span>
                </span>
                <span className="text-sm text-zinc-600 dark:text-zinc-400">{app.description}</span>
                <span className="mt-auto text-xs text-zinc-600 dark:text-zinc-400">
                  {items.map((i) => i.label).join(' · ')}
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </AppShell>
  )
}
