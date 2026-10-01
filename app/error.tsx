'use client'

export default function Error({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <h2 className="text-xl font-bold">Something went wrong.</h2>
      <p className="text-sm text-zinc-500">Please try again.</p>
      <button
        onClick={reset}
        className="min-h-[44px] rounded-lg bg-black px-6 py-2 font-semibold text-white dark:bg-white dark:text-black"
      >
        Try again
      </button>
    </main>
  )
}
