import { SkeletonCards, SkeletonRows, SkeletonTable } from '@/components/ui/Skeleton'

export default function Loading() {
  return (
    <main>
      <div className="h-8 w-40 animate-pulse rounded-lg bg-zinc-100 dark:bg-zinc-800" />
      <div className="mt-4">
        <SkeletonCards count={4} />
      </div>
      <div className="mt-4 h-10 animate-pulse rounded-lg bg-zinc-100 dark:bg-zinc-800" />
      <div className="mt-4 h-40 animate-pulse rounded-2xl bg-white shadow dark:bg-zinc-900" />
      <div className="mt-4">
        <div className="md:hidden">
          <SkeletonRows rows={4} />
        </div>
        <SkeletonTable rows={6} />
      </div>
    </main>
  )
}