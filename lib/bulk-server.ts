import 'server-only'
import { unstable_rethrow } from 'next/navigation'
import { runBulk, type BulkResult, type ItemOutcome } from '@/lib/bulk'

/** runBulk untuk server action: redirect/notFound dari aksi satuan diteruskan. */
export function bulk(raw: unknown, fn: (id: string) => Promise<ItemOutcome>, verb?: string): Promise<BulkResult> {
  return runBulk(raw, fn, { verb, rethrow: unstable_rethrow })
}
