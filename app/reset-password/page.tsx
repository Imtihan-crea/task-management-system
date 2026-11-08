'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { completePasswordChange } from '@/app/actions/password'
import { MIN_SELF_PASSWORD_LENGTH, validateSelfPassword, friendlyPasswordError } from '@/lib/auth/password'

type Phase = 'checking' | 'ready' | 'invalid' | 'saving'

/**
 * Kunci sessionStorage tempat halaman "/" menitipkan hash recovery.
 * Dipisah dari hash undangan supaya tidak tertukar.
 */
const HASH_KEY = 'tms:recovery-hash'

function getRecoveryHash(): string {
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

function readErrorFromHash(): string | null {
  if (typeof window === 'undefined') return null

  const params = new URLSearchParams(getRecoveryHash().replace(/^#/, ''))
  const errorCode = params.get('error_code')
  const description = params.get('error_description')

  if (errorCode === 'otp_expired') {
    return 'Link reset Password ini sudah dipakai atau kedaluwarsa. Minta yang baru dari administrator Anda.'
  }

  if (errorCode) {
    return description
      ? decodeURIComponent(description)
      : 'Link reset Password ini sudah tidak berlaku.'
  }

  return null
}

/**
 * Halaman reset password (5 Nov 2026).
 *
 * Dipakai oleh link recovery Supabase (email "Reset password" atau link yang
 * dikirim admin lewat Supabase Dashboard). Sebelumnya link recovery ikut
 * diarahkan ke /accept-invite karena dianggap undangan, sehingga selalu gagal.
 *
 * Tiga bentuk link yang ditangani:
 * 1. `#access_token=...&refresh_token=...&type=recovery` (implicit)
 * 2. `#token_hash=...&type=recovery` (link yang di-generate server)
 * 3. `?code=...` (PKCE)
 *
 * Setelah session terbentuk, user mengisi password baru (minimal 8 karakter).
 * Password diubah lewat sesi user sendiri, bukan service role.
 */
export default function ResetPasswordPage() {
  const router = useRouter()
  const [phase, setPhase] = useState<Phase>('checking')
  const [error, setError] = useState('')
  const [linkError, setLinkError] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    let cancelled = false

    async function check() {
      const hashParams = new URLSearchParams(getRecoveryHash().replace(/^#/, ''))

      // Bentuk 3: PKCE (?code=...)
      const code = new URLSearchParams(window.location.search).get('code')
      if (code) {
        const { error: codeError } = await supabase.auth.exchangeCodeForSession(code)
        if (codeError) {
          console.error('[reset-password] exchangeCodeForSession failed:', codeError.message)
        }
      }

      // Bentuk 2: #token_hash=...&type=recovery
      const tokenHash = hashParams.get('token_hash')
      if (tokenHash) {
        const { error: otpError } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: 'recovery',
        })
        if (otpError) {
          console.error('[reset-password] verifyOtp failed:', otpError.message)
        }
      }

      let { data } = await supabase.auth.getSession()

      // Bentuk 1: hash berisi access_token. Client memakai flow PKCE, jadi
      // token implicit tidak selalu dibaca otomatis — set manual.
      if (!data.session) {
        const accessToken = hashParams.get('access_token')
        const refreshToken = hashParams.get('refresh_token')

        if (accessToken && refreshToken) {
          const { error: sessionError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          })
          if (sessionError) {
            console.error('[reset-password] setSession failed:', sessionError.message)
          }
          data = (await supabase.auth.getSession()).data
        }
      }

      if (cancelled) return

      if (data.session) {
        setEmail(data.session.user.email ?? '')
        setPhase('ready')
        return
      }

      setLinkError(
        readErrorFromHash() ??
          'Link reset Password ini tidak valid atau sudah dipakai.'
      )
      setPhase('invalid')
    }

    check()

    return () => {
      cancelled = true
    }
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    const fieldError = validateSelfPassword(password, confirm)
    if (fieldError) {
      setError(fieldError)
      return
    }

    setPhase('saving')

    const supabase = createClient()
    const { error: updateError } = await supabase.auth.updateUser({ password })

    if (updateError) {
      console.error('[reset-password] updateUser failed:', updateError.message)
      setPhase('ready')
      setError(
        friendlyPasswordError(
          updateError.message,
          'Sesi reset Anda telah berakhir. Silakan buka Link reset sekali lagi.'
        )
      )
      return
    }

    // JANGAN panggil refreshSession() di sini. Pada sesi hasil link recovery,
    // rotasi refresh token bisa membuat sesi terbuang, lalu server action
    // mengira sesi sudah habis padahal password sudah tersimpan.
    const { data: sessionData } = await supabase.auth.getSession()
    const result = await completePasswordChange(sessionData.session?.access_token)

    if (result.error) {
      // Password SUDAH tersimpan. Jangan suruh user mengulang reset —
      // cukup catat; guard /change-password akan menangani kalau flag
      // must_change_password belum sempat dibersihkan.
      console.error('[reset-password] completePasswordChange:', result.error)
    }

    try {
      window.sessionStorage.removeItem(HASH_KEY)
    } catch {
      // sessionStorage bisa diblokir; tidak masalah.
    }

    router.push('/dashboard')
    router.refresh()
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 dark:bg-black">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow dark:bg-zinc-900">
        <h1 className="text-center text-2xl font-bold">TASK MANAGEMENT SYSTEM</h1>

        {phase === 'checking' && (
          <p className="mt-6 text-center text-sm text-zinc-500">
            Memeriksa Link reset Password Anda...
          </p>
        )}

        {phase === 'invalid' && (
          <div className="mt-6 text-center">
            <p className="text-sm font-medium text-red-600">{linkError}</p>
            <p className="mt-2 text-sm text-zinc-500">
              Setiap Link reset hanya dapat dibuka satu kali dan akan kedaluwarsa setelah beberapa waktu.
            </p>
            <a
              href="/login"
              className="mt-6 inline-flex min-h-[44px] items-center rounded-lg bg-black px-6 py-2 font-semibold text-white dark:bg-white dark:text-black"
            >
              Ke halaman Login
            </a>
          </div>
        )}

        {(phase === 'ready' || phase === 'saving') && (
          <>
            <p className="mt-2 text-center text-sm text-zinc-500">
              {email ? (
                <>
                  Atur Password baru untuk <span className="font-medium">{email}</span>.
                </>
              ) : (
                'Atur Password baru untuk akun Anda.'
              )}
            </p>

            <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
              <div>
                <label htmlFor="password" className="mb-1 block text-sm font-medium">
                  Password Baru
                </label>
                <input
                  id="password"
                  type={show ? 'text' : 'password'}
                  required
                  minLength={MIN_SELF_PASSWORD_LENGTH}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={`Minimal ${MIN_SELF_PASSWORD_LENGTH} karakter`}
                  className="w-full rounded-lg border px-3 py-2 text-base outline-none focus:border-black dark:border-zinc-700 dark:bg-zinc-800"
                />
              </div>

              <div>
                <label htmlFor="confirm" className="mb-1 block text-sm font-medium">
                  Konfirmasi Password Baru
                </label>
                <input
                  id="confirm"
                  type={show ? 'text' : 'password'}
                  required
                  minLength={MIN_SELF_PASSWORD_LENGTH}
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="Ulangi password"
                  className="w-full rounded-lg border px-3 py-2 text-base outline-none focus:border-black dark:border-zinc-700 dark:bg-zinc-800"
                />
              </div>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={show}
                  onChange={(e) => setShow(e.target.checked)}
                  className="h-4 w-4"
                />
                Tampilkan Password
              </label>

              {error && (
                <p role="alert" className="text-sm font-medium text-red-600">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={phase === 'saving'}
                className="min-h-[44px] w-full rounded-lg bg-kasuat-gold px-4 py-2 font-semibold text-kasuat-black disabled:opacity-50"
              >
                {phase === 'saving' ? 'Menyimpan...' : 'Simpan Password Baru'}
              </button>
            </form>
          </>
        )}
      </div>
    </main>
  )
}
