import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { LogoutButton } from '@/components/auth/LogoutButton'
import type { Profile } from '@/types/profile'

function roleLabel(role: Profile['role']) {
  switch (role) {
    case 'ADMIN':
      return 'ADMIN'
    case 'PROJECT_MANAGER':
      return 'PROJECT MANAGER'
    case 'TEAM_MEMBER':
      return 'TEAM MEMBER'
    case 'VIEWER':
      return 'VIEWER'
  }
}

export default async function DashboardPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Secure check: tidak ada session -> ke login
  if (!user) {
    redirect('/login')
  }

  // Secure check: ambil profile dari DB (RLS berlaku)
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, email, role, is_active')
    .eq('id', user.id)
    .single<Pick<Profile, 'full_name' | 'email' | 'role' | 'is_active'>>()

  if (!profile) {
    redirect('/login')
  }

  if (!profile.is_active) {
    // Paksa logout agar session mati
    await supabase.auth.signOut()
    redirect('/login')
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 dark:bg-black">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow dark:bg-zinc-900">
        <h1 className="text-2xl font-bold">TASK MANAGEMENT SYSTEM</h1>

        <p className="mt-4 text-lg">
          Welcome, {profile.full_name || profile.email}
        </p>
        <p className="mt-2 text-sm text-zinc-500">Role: {roleLabel(profile.role)}</p>
        <p className="text-sm text-zinc-500">
          Status: {profile.is_active ? 'Active' : 'Inactive'}
        </p>

        <hr className="my-6" />

        <p className="text-sm">Foundation is ready.</p>
        <p className="text-sm text-zinc-500">
          Task Management will be available in the next phase.
        </p>

        <div className="mt-6">
          <LogoutButton />
        </div>
      </div>
    </main>
  )
}
