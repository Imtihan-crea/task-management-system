'use client'

import Link from 'next/link'
import { KasuatMark } from '@/components/brand/KasuatLogo'
import { Button } from '@/components/ui/primitives'

export default function Error({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-kasuat-off-white px-4 text-center dark:bg-black">
      <KasuatMark size={48} decorative />
      <p className="font-heading text-5xl font-bold text-kasuat-black dark:text-zinc-100">
        500
      </p>
      <h2 className="font-heading text-xl font-bold">Something went wrong.</h2>
      <p className="text-sm text-zinc-500">Please try again.</p>
      <div className="flex flex-wrap justify-center gap-2">
        <Button onClick={reset}>Try again</Button>
        <Link
          href="/dashboard"
          className="inline-flex min-h-[44px] items-center rounded-lg border border-zinc-300 px-6 py-2 text-sm font-semibold dark:border-zinc-700"
        >
          Back to Dashboard
        </Link>
      </div>
    </main>
  )
}
