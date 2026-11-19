import Link from 'next/link'
import { requirePermission } from '@/lib/auth/current-access'
import { AppShell } from '@/components/layout/AppShell'
import { LeadForm } from '@/components/clients/ClientForms'
import { getActiveUsers } from '@/lib/data/users'
import { displayName } from '@/lib/data/user-options'

export default async function NewLeadPage() {
  await requirePermission('clients.manage')
  const users = await getActiveUsers()
  return (
    <AppShell>
      <Link href="/clients" className="text-sm font-medium text-zinc-600 hover:underline dark:text-zinc-400">&larr; Kembali ke Client Management</Link>
      <h1 className="mt-2 text-xl font-bold">Tambah Lead</h1>
      <div className="mt-4 rounded-2xl bg-white p-5 shadow dark:bg-zinc-900">
        <LeadForm pics={users.map((u) => ({ id: u.id, name: displayName(u) }))} />
      </div>
    </AppShell>
  )
}
