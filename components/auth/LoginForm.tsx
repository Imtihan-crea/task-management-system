'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export function LoginForm({ inactiveMessage }: { inactiveMessage?: string }) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const supabase = createClient()

      const { data, error: signInError } =
        await supabase.auth.signInWithPassword({ email, password })

      if (signInError || !data.user) {
        // Pesan sengaja sama untuk email salah maupun password salah
        setError('Invalid email or password.')
        return
      }

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('status')
        .eq('id', data.user.id)
        .single<{ status: string }>()

      if (profileError || !profile) {
        await supabase.auth.signOut()
        setError('Something went wrong. Please try again.')
        return
      }

      // Belum selesai setup password (undangan belum diselesaikan)
      if (profile.status === 'INVITED') {
        await supabase.auth.signOut()
        setError('Your account invitation is not completed yet.')
        return
      }

      if (profile.status !== 'ACTIVE') {
        await supabase.auth.signOut()
        setError('Your account is inactive. Please contact an administrator.')
        return
      }

      router.push('/dashboard')
      router.refresh()
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 dark:bg-black">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow dark:bg-zinc-900">
        <h1 className="text-center text-2xl font-bold">TASK MANAGEMENT SYSTEM</h1>
        <p className="mt-2 text-center text-sm text-zinc-500">
          Login untuk lanjut ke dashboard
        </p>

        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-medium">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nama@email.com"
              className="w-full rounded-lg border px-3 py-2 text-base outline-none focus:border-black dark:border-zinc-700 dark:bg-zinc-800"
            />
          </div>

          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full rounded-lg border px-3 py-2 text-base outline-none focus:border-black dark:border-zinc-700 dark:bg-zinc-800"
            />
          </div>

          {(inactiveMessage || error) && (
            <p role="alert" className="text-sm font-medium text-red-600">
              {error || inactiveMessage}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="min-h-[44px] w-full rounded-lg bg-black px-4 py-2 font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-black"
          >
            {loading ? 'Loading...' : 'LOGIN'}
          </button>
        </form>
      </div>
    </main>
  )
}
