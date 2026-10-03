import Link from 'next/link'
import { requireAdmin } from '@/lib/auth/session'
import { AppShell } from '@/components/layout/AppShell'
import { InviteUserForm } from '@/components/users/InviteUserForm'

export default async function InviteUserPage() {
  await requireAdmin()

  return (
    <AppShell>
      <Link href="/users" className="text-sm font-medium text-zinc-500 hover:underline">
        &larr; Back to Users
      </Link>
      <h1 className="mt-2 text-xl font-bold">Invite User</h1>

      <div className="mt-4">
        <InviteUserForm />
      </div>
    </AppShell>
  )
}
