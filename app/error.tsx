'use client'

import * as Sentry from '@sentry/nextjs'
import Link from 'next/link'
import { useEffect } from 'react'
import { KasuatLogo } from '@/components/brand/KasuatLogo'
import { Button } from '@/components/ui/primitives'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  // Error di browser ke Sentry bila aktif (no-op tanpa DSN).
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-kasuat-black px-4 text-center">
      <KasuatLogo height={40} />
      <p className="font-heading text-5xl font-bold text-white">
        500
      </p>
      <h2 className="font-heading text-xl font-bold text-white">Terjadi kesalahan.</h2>
      <p className="text-sm text-zinc-400">Silakan coba lagi.</p>
      <div className="flex flex-wrap justify-center gap-2">
        <Button onClick={reset}>Coba lagi</Button>
        <Link
          href="/dashboard"
          className="inline-flex min-h-[44px] items-center rounded-lg border border-zinc-600 px-6 py-2 text-sm font-semibold text-zinc-100"
        >
          Kembali ke Dashboard
        </Link>
      </div>
    </main>
  )
}
