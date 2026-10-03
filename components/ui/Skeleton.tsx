/**
 * Skeleton rows (§12, §24). Hanya untuk area konten yang loading —
 * shell/header/sidebar tidak ikut loading.
 */
export function SkeletonRows({ rows = 5 }: { rows?: number }) {
  return (
    <div aria-hidden="true" className="flex flex-col gap-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="h-[68px] animate-pulse rounded-2xl bg-zinc-100 dark:bg-zinc-800"
        />
      ))}
    </div>
  )
}

export function SkeletonTable({ rows = 6 }: { rows?: number }) {
  return (
    <div aria-hidden="true" className="hidden overflow-hidden rounded-2xl bg-white shadow md:block dark:bg-zinc-900">
      <div className="h-11 animate-pulse bg-zinc-100 dark:bg-zinc-800" />
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="h-[52px] animate-pulse border-t border-zinc-100 bg-white dark:border-zinc-800 dark:bg-zinc-900"
        />
      ))}
    </div>
  )
}

export function SkeletonCards({ count = 4 }: { count?: number }) {
  return (
    <div aria-hidden="true" className="grid gap-3 sm:grid-cols-2">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="h-36 animate-pulse rounded-2xl bg-zinc-100 dark:bg-zinc-800"
        />
      ))}
    </div>
  )
}

export function SkeletonGantt({ rows = 5 }: { rows?: number }) {
  return (
    <div aria-hidden="true" className="flex flex-col gap-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="h-4 w-32 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
          <div
            className="h-6 animate-pulse rounded-full bg-zinc-100 dark:bg-zinc-800"
            style={{ width: `${35 + ((i * 13) % 40)}%` }}
          />
        </div>
      ))}
    </div>
  )
}
