'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

/**
 * Halaman "/" hanya pengarah.
 *
 * Undangan Supabase datang sebagai token di bagian URL hash
 * (#access_token=...&type=invite). Token itu TIDAK pernah dikirim ke
 * server, jadi server tidak tahu ada undangan. Kalau server langsung
 * redirect ke /login, token hilang sebelum browser sempat memakainya.
 *
 * Solusinya: jangan pakai redirect sama sekali kalau hash berisi token.
 * Kita simpan hash itu ke sessionStorage, lalu pindah ke /accept-invite.
 * Dengan begitu token ikut terbawa walau URL-nya diganti.
 */
export default function RootPage() {
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient()
    let cancelled = false

    const hash = window.location.hash

    const params = new URLSearchParams(hash.replace(/^#/, ''))
    const hasInviteToken =
      params.has('access_token') ||
      params.has('token_hash') ||
      params.get('type') === 'invite' ||
      params.get('error_code')

    if (hasInviteToken) {
      // Simpan dulu supaya tetap ada setelah URL berubah.
      // supabase-js membaca session dari URL, tapi hash ini kita
      //-keeping supaya halaman tujuan tidak perlu bergantung pada URL.
      window.sessionStorage.setItem('tms:invite-hash', hash)
      if (!cancelled) router.replace('/accept-invite')
      return
    }

    async function route() {
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
