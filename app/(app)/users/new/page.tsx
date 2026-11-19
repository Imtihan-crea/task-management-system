import Link from 'next/link'
import { requirePermission } from '@/lib/auth/current-access'
import { AppShell } from '@/components/layout/AppShell'
import { CreateUserForm } from '@/components/users/CreateUserForm'
import { InviteUserForm } from '@/components/users/InviteUserForm'

export default async function AddUserPage() {
  await requirePermission('users.invite')

  return (
    <AppShell>
      <Link href="/users" className="inline-flex min-h-[44px] items-center text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:underline">
        &larr; Kembali ke Users
      </Link>
      <h1 className="mt-2 text-xl font-bold">Tambah User</h1>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        Dua cara: buat langsung dengan password (tanpa email), atau kirim
        undangan lewat email.
      </p>

      <div className="mt-4 flex flex-col gap-6">
        <CreateUserForm />

        <div className="flex items-center gap-3 text-xs uppercase text-zinc-600 dark:text-zinc-400">
          <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-700" />
          atau
          <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-700" />
        </div>

        <InviteUserForm />
      </div>
    </AppShell>
  )
}
