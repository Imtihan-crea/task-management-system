'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { completeInvite } from '@/app/actions/invite'

type Phase = 'checking' | 'ready' | 'invalid' | 'saving' | 'done' | 'already-active'

/** Kunci sessionStorage tempat halaman "/" menitipkan hash undangan. */
const HASH_KEY = 'tms:invite-hash'

/**
 * Ambil hash undangan dari URL, atau dari sessionStorage kalau URL
 * sudah bersih karena sempat redirect.
 *
 * Halaman "/" menyimpan hash ke sessionStorage sebelum pindah halaman,
 * supaya token invitation tidak hilang.
 */
function getInviteHash(): string {
  if (typeof window === 'undefined') return ''

  if (window.location.hash && window.location.hash.length > 1) {
    return window.location.hash
  }

  try {
    return window.sessionStorage.getItem(HASH_KEY) ?? ''
  } catch {
    return ''
  }
}

/**
 * Tukar `token_hash` dari hash undangan menjadi session.
 *
 * Dua bentuk link yang mungkin kita terima:
 * 1. `#access_token=...` — dari link email resmi Supabase (sudah session)
 * 2. `#token_hash=...&type=invite` — dari link yang di-generate di server
 *    (dipakai saat kuota email Supabase habis)
 *
 * Bentuk kedua harus diverifikasi ke server Supabase dulu supaya
 * menjadi session yang benar.
 */
async function exchangeTokenIfPresent(
  supabase: ReturnType<typeof createClient>
): Promise<void> {
  const params = new URLSearchParams(getInviteHash().replace(/^#/, ''))
  const tokenHash = params.get('token_hash')

  if (!tokenHash) return // bentuk 1, sudah ditangani detectSessionInUrl

  // `token_hash` (bukan `token`) adalah parameter yang benar untuk
  // verifyOtp dari link email. Mengirim `token` akan ditolak 403.
  await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: 'invite',
  })
}

/**
 * Kalau session tidak ada padahal hash berisi access_token, berarti
 * supabase-js gagal memproses hash (mis. sudah dibersihkan).
 * Coba set session manual dari token yang tersimpan.
 */
async function restoreSessionFromStoredHash(
  supabase: ReturnType<typeof createClient>
): Promise<{ error: { message: string } | null }> {
  const params = new URLSearchParams(getInviteHash().replace(/^#/, ''))
  const accessToken = params.get('access_token')
  const refreshToken = params.get('refresh_token')

  if (!accessToken || !refreshToken) return { error: null }

  return supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
}

function readErrorFromUrl(): string | null {
  if (typeof window === 'undefined') return null

  const params = new URLSearchParams(getInviteHash().replace(/^#/, ''))
  const errorCode = params.get('error_code')
  const description = params.get('error_description')

  if (errorCode === 'otp_expired') {
    return 'This invitation link has already been used or has expired. Ask your administrator to send a new invitation.'
  }

  if (errorCode) {
    return description ? decodeURIComponent(description) : 'This invitation link is no longer valid.'
  }

  return null
}

export default function AcceptInvitePage() {
  const router = useRouter()
  const [phase, setPhase] = useState<Phase>('checking')
  const [error, setError] = useState('')
  const [linkError, setLinkError] = useState<string | null>(null)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')

  // Token undangan datang di URL hash (#access_token=...&type=invite).
  // supabase-js membaca & menyimpannya ke cookie secara otomatis.
  useEffect(() => {
    const supabase = createClient()
    let cancelled = false

    async function check() {
      // Bentuk link #token_hash=...&type=invite (dipakai saat kuota email habis)
      if (getInviteHash().includes('token_hash=')) {
        await exchangeTokenIfPresent(supabase)
      }

      let { data } = await supabase.auth.getSession()

      // Cadangan: kalau hash berisi access_token tapi session belum ada,
      // coba setSession manual. Ini menutup kemungkinan hash sempat
      // dibersihkan sebelum detectSessionInUrl sempat memakainya.
      if (!data.session && getInviteHash().includes('access_token=')) {
        const { error: restoreError } = await restoreSessionFromStoredHash(supabase)
        if (restoreError) {
          console.error('[accept-invite] restore session failed:', restoreError.message)
        }
        data = (await supabase.auth.getSession()).data
      }

      if (cancelled) return

      if (!data.session) {
        setLinkError(
          readErrorFromUrl() ??
            'This invitation link is invalid or has already been used.'
        )
        setPhase('invalid')
        return
      }

      // Kalau akun sudah ACTIVE, tidak perlu set password lagi.
      const { data: userData } = await supabase.auth.getUser()
      const userEmail = userData.user?.email

      if (userEmail) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('status')
          .eq('id', userData.user!.id)
          .single<{ status: string }>()

        if (profile?.status === 'ACTIVE') {
          if (!cancelled) setPhase('already-active')
          return
        }
      }

      setPhase('ready')
    }

    check()

    // Fallback: kalau cookie belum siap saat mount, coba lagi sekali lagi
    const timer = setTimeout(check, 1500)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [])

  // Kalau akun sudah ACTIVE, tidak perlu set password lagi.
  useEffect(() => {
    if (phase !== 'already-active') return
    completeInvite().catch(() => {
      router.replace('/dashboard')
    })
  }, [phase, router])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }

    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }

    setPhase('saving')

    const supabase = createClient()
    const { error: updateError } = await supabase.auth.updateUser({ password })

    if (updateError) {
      // Dicatat supaya bisaSeen di log server / console browser
      console.error('[accept-invite] updateUser failed:', updateError.message)
      setPhase('ready')
      setError(
        /session|token|jwt|auth/i.test(updateError.message)
          ? 'Your invitation session expired. Please open the invitation link again.'
          : 'Unable to set password. Please try again.'
      )
      return
    }

    setPhase('done')
    await completeInvite()
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 dark:bg-black">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow dark:bg-zinc-900">
        <h1 className="text-center text-2xl font-bold">TASK MANAGEMENT SYSTEM</h1>

        {phase === 'checking' && (
          <p className="mt-6 text-center text-sm text-zinc-500">
            Checking your invitation...
          </p>
        )}

        {phase === 'invalid' && (
          <div className="mt-6 text-center">
            <p className="text-sm font-medium text-red-600">{linkError}</p>
            <p className="mt-2 text-sm text-zinc-500">
              Each invitation link can only be opened once.
            </p>
            <a
              href="/login"
              className="mt-6 inline-flex min-h-[44px] items-center rounded-lg bg-black px-6 py-2 font-semibold text-white dark:bg-white dark:text-black"
            >
              Go to Login
            </a>
          </div>
        )}

        {phase === 'already-active' && (
          <p className="mt-6 text-center text-sm font-medium text-green-600">
            Account already activated. Redirecting to dashboard...
          </p>
        )}

        {(phase === 'ready' || phase === 'saving') && (
          <>
            <p className="mt-2 text-center text-sm text-zinc-500">
              Welcome! Set your password to activate your account.
            </p>

            <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
              <div>
                <label htmlFor="password" className="mb-1 block text-sm font-medium">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimal 8 karakter"
                  className="w-full rounded-lg border px-3 py-2 text-base outline-none focus:border-black dark:border-zinc-700 dark:bg-zinc-800"
                />
              </div>

              <div>
                <label
                  htmlFor="confirm"
                  className="mb-1 block text-sm font-medium"
                >
                  Confirm Password
                </label>
                <input
                  id="confirm"
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="Ulangi password"
                  className="w-full rounded-lg border px-3 py-2 text-base outline-none focus:border-black dark:border-zinc-700 dark:bg-zinc-800"
                />
              </div>

              {error && (
                <p role="alert" className="text-sm font-medium text-red-600">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={phase === 'saving'}
                className="min-h-[44px] w-full rounded-lg bg-black px-4 py-2 font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-black"
              >
                {phase === 'saving' ? 'Activating...' : 'Set Password & Activate'}
              </button>
            </form>
          </>
        )}

        {phase === 'done' && (
          <p className="mt-6 text-center text-sm font-medium text-green-600">
            Account activated. Redirecting to dashboard...
          </p>
        )}
      </div>
    </main>
  )
}
