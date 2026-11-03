import Link from 'next/link'
import { requireAdmin } from '@/lib/auth/session'
import { AppShell } from '@/components/layout/AppShell'
import { CreateUserForm } from '@/components/users/CreateUserForm'
import { InviteUserForm } from '@/components/users/InviteUserForm'

export default async function AddUserPage() {
  await requireAdmin()

  return (
    <AppShell>
      <Link href="/users" className="text-sm font-medium text-zinc-500 hover:underline">
        &larr; Back to Users
      </Link>
      <h1 className="mt-2 text-xl font-bold">Add User</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Dua cara: buat langsung dengan password (tanpa email), atau kirim
        undangan lewat email.
      </p>

      <div className="mt-4 flex flex-col gap-6">
        <CreateUserForm />

        <div className="flex items-center gap-3 text-xs uppercase text-zinc-400">
          <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-700" />
          atau
          <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-700" />
        </div>

        <InviteUserForm />
      </div>
    </AppShell>
  )
}
