'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

/**
 * Halaman "/" hanya pengarah.
 *
 * Kenapa tidak pakai server redirect?
 * Undangan Supabase datang sebagai token di bagian URL hash
 * (#access_token=...&type=invite). Kalau server langsung redirect ke
 * /dashboard, token itu sempat hilang sebelum sempat dibaca browser,
 * lalu user terjebak di halaman login.
 *
 * Jadi di sini kita tunggu browser selesai membaca token dulu,
 * baru tentukan tujuan:
 *
 *   - ada token undangan  -> /accept-invite
 *   - sudah login         -> /dashboard
 *   - belum login         -> /login
 */
export default function RootPage() {
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient()
    let cancelled = false

    async function route() {
      // Hash invitation: type=invite / type=recovery / ada access_token
      const hash = window.location.hash.replace(/^#/, '')
      const params = new URLSearchParams(hash)
      const hasInviteToken =
        params.has('access_token') ||
        params.get('type') === 'invite' ||
        params.get('error_code')

      if (hasInviteToken) {
        if (!cancelled) router.replace('/accept-invite')
        return
      }

      const { data } = await supabase.auth.getSession()
      if (cancelled) return

      if (data.session) {
        router.replace('/dashboard')
      } else {
        router.replace('/login')
      }
    }

    route()
    const timer = setTimeout(route, 1200)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [router])

  return (
    <main className="flex min-h-screen items-center justify-center">
      <p className="text-sm text-zinc-500">Loading...</p>
    </main>
  )
}
