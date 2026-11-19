import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { requireProfile } from '@/lib/auth/session'
import { canViewClients, hasPermission } from '@/lib/auth/current-access'
import { AppShell } from '@/components/layout/AppShell'
import { ButtonLink, PageHeader } from '@/components/ui/primitives'
import { LeadForm, NoteForm, StageForm } from '@/components/clients/ClientForms'
import { loadLead, loadLeadEvents, loadNames } from '@/lib/clients/data'
import { STAGE_LABEL, allowedTargets, rupiah } from '@/lib/clients/pipeline'
import { getActiveUsers } from '@/lib/data/users'
import { displayName } from '@/lib/data/user-options'
import { formatDateTime } from '@/lib/utils/dates'

const CARD = 'mt-6 rounded-2xl bg-white p-5 shadow dark:bg-zinc-900'

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const profile = await requireProfile()
  if (!(await canViewClients(profile.id))) redirect('/dashboard?denied=1')
  const { id } = await params
  const lead = await loadLead(id)
  if (!lead) notFound()

  const [events, users, canManage, canCreateProject] = await Promise.all([
    loadLeadEvents(id),
    getActiveUsers(),
    hasPermission(profile.id, 'clients.manage'),
    hasPermission(profile.id, 'projects.create'),
  ])
  const names = await loadNames([lead.owner_id, ...events.map((e) => e.author_id)])

  return (
    <AppShell>
      <Link href="/clients" className="text-sm font-medium text-zinc-600 hover:underline dark:text-zinc-400">&larr; Kembali ke Client Management</Link>
      <div className="mt-2">
        <PageHeader
          title={lead.company_name}
          subtitle={`${STAGE_LABEL[lead.stage]} · ${rupiah(lead.estimated_value)} · PIC: ${lead.owner_id ? names[lead.owner_id] ?? '-' : '-'}`}
          actions={lead.stage === 'DEAL' && canCreateProject ? <ButtonLink href={`/projects/new?client=${encodeURIComponent(lead.company_name)}`}>Buat project</ButtonLink> : undefined}
        />
      </div>
      {lead.stage === 'BATAL' && lead.lost_reason && (
        <p className="mt-3 rounded-lg border border-red-300 p-3 text-sm dark:border-red-700">Alasan batal: {lead.lost_reason}</p>
      )}

      {canManage && (
        <>
          <section className={CARD}>
            <h2 className="mb-3 text-lg font-bold">Pindah tahap</h2>
            <StageForm id={lead.id} targets={allowedTargets(lead.stage)} />
          </section>
          <section className={CARD}>
            <h2 className="mb-3 text-lg font-bold">Data lead</h2>
            <LeadForm lead={lead} pics={users.map((u) => ({ id: u.id, name: displayName(u) }))} />
          </section>
        </>
      )}

      {!canManage && (
        <section className={CARD}>
          <h2 className="mb-3 text-lg font-bold">Data lead</h2>
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div><dt className="font-medium">Kontak</dt><dd>{lead.contact_name ?? '-'}</dd></div>
            <div><dt className="font-medium">Email</dt><dd>{lead.contact_email ?? '-'}</dd></div>
            <div><dt className="font-medium">Telepon</dt><dd>{lead.contact_phone ?? '-'}</dd></div>
            <div><dt className="font-medium">Sumber</dt><dd>{lead.source ?? '-'}</dd></div>
            <div className="sm:col-span-2"><dt className="font-medium">Catatan</dt><dd className="whitespace-pre-wrap">{lead.notes ?? '-'}</dd></div>
          </dl>
        </section>
      )}

      <section className={CARD}>
        <h2 className="mb-3 text-lg font-bold">Riwayat</h2>
        {canManage && <div className="mb-5"><NoteForm id={lead.id} /></div>}
        {events.length === 0 ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">Belum ada riwayat.</p>
        ) : (
          <ol className="flex flex-col gap-4">
            {events.map((e) => (
              <li key={e.id} className="text-sm">
                {e.to_stage && <p className="font-semibold">{e.from_stage ? `${STAGE_LABEL[e.from_stage]} → ${STAGE_LABEL[e.to_stage]}` : STAGE_LABEL[e.to_stage]}</p>}
                {e.body && <p className="whitespace-pre-wrap break-words">{e.body}</p>}
                <p className="text-zinc-600 dark:text-zinc-400">{e.author_id ? names[e.author_id] ?? 'User tidak dikenal' : 'Sistem'} · {formatDateTime(e.created_at)}</p>
              </li>
            ))}
          </ol>
        )}
      </section>
    </AppShell>
  )
}
