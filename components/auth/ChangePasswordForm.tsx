'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { completePasswordChange } from '@/app/actions/password'
import { friendlyPasswordError, validateSelfPassword } from '@/lib/auth/password'
import { KasuatLogo } from '@/components/brand/KasuatLogo'

/**
 * Halaman ganti password (3 Nov 2026).
 *
 * Muncul otomatis setelah login kalau admin mencentang
 * "Require password change on first login", tapi user juga bisa membuka
 * /change-password kapan saja untuk mengganti password sendiri.
 *
 * Password diubah lewat sesi user (`supabase.auth.updateUser`), jadi
 * tidak ada admin/service-role yang menyentuh password baru.
 */
export function ChangePasswordForm({ email }: { email: string }) {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  // Password sudah tersimpan tapi flag belum bersih: coba ulang tanpa
  // updateUser lagi (Supabase menolak password yang sama).
  // Disimpan nilainya: bila user mengetik password lain, simpan ulang.
  const [savedPassword, setSavedPassword] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    const fieldError = validateSelfPassword(password, confirm)
    if (fieldError) {
      setError(fieldError)
      return
    }

    setLoading(true)

    try {
      const supabase = createClient()

      if (savedPassword !== password) {
        const { error: updateError } = await supabase.auth.updateUser({ password })

        if (updateError) {
          console.error('[change-password] updateUser failed:', updateError.message)
          setError(
            friendlyPasswordError(
              updateError.message,
              'Your session has expired. Please log in again.'
            )
          )
          return
        }
        setSavedPassword(password)
      }

      // Password minimal tersimpan di Supabase. Jangan panggil
      // refreshSession() — rotasi refresh token bisa membuang sesi.
      // Kirim access token ke server action supaya profil tetap ditemukan
      // walau cookie sesi belum sempat terbaca.
      const { data: sessionData } = await supabase.auth.getSession()
      const result = await completePasswordChange(sessionData.session?.access_token)
      if (result.error) {
        // Audit B18: jangan redirect (halaman akan kembali ke sini tanpa
        // penjelasan); tampilkan pesannya.
        console.error('[change-password] completePasswordChange:', result.error)
        setError(result.error)
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

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-kasuat-black px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 dark:bg-zinc-900">
        <div className="flex justify-center py-2">
          <KasuatLogo height={36} />
        </div>
        <p className="mt-2 text-center font-heading text-2xl font-bold text-kasuat-black dark:text-zinc-100">
          Change Password
        </p>
        <p className="mt-1 text-center text-sm text-zinc-500">
          Masukkan password baru untuk {email}
        </p>

        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
          <div>
            <label htmlFor="new_password" className="mb-1 block text-sm font-medium">
              New Password
            </label>
            <input
              id="new_password"
              type={show ? 'text' : 'password'}
              required
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-base outline-none focus:border-kasuat-gold dark:border-zinc-700 dark:bg-zinc-800"
            />
            <p className="mt-1 text-xs text-zinc-500">Minimal 8 karakter.</p>
          </div>

          <div>
            <label htmlFor="confirm_password" className="mb-1 block text-sm font-medium">
              Confirm New Password
            </label>
            <input
              id="confirm_password"
              type={show ? 'text' : 'password'}
              required
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-base outline-none focus:border-kasuat-gold dark:border-zinc-700 dark:bg-zinc-800"
            />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={show}
              onChange={(e) => setShow(e.target.checked)}
              className="h-4 w-4"
            />
            Show password
          </label>

          {error && (
            <p role="alert" className="text-sm font-medium text-red-600">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-kasuat-gold px-4 py-2 text-sm font-semibold text-kasuat-black disabled:opacity-50"
          >
            {loading ? 'Saving...' : 'Save New Password'}
          </button>

          <button
            type="button"
            onClick={handleLogout}
            className="text-sm font-medium text-zinc-500 hover:underline"
          >
            Log out
          </button>
        </form>
      </div>
    </main>
  )
}
