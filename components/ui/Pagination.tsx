import Link from 'next/link'

/**
 * Navigasi halaman generik. Semua filter dipertahankan via query string.
 */
export function Pagination({
  basePath,
  params,
  page,
  totalPages,
  total,
  label = 'entries',
}: {
  basePath: string
  params: Record<string, string>
  page: number
  totalPages: number
  total: number
  label?: string
}) {
  const href = (p: number) => {
    const search = new URLSearchParams({ ...params, page: String(p) })
    return `${basePath}?${search.toString()}`
  }

  return (
    <div className="mt-4 flex items-center justify-between">
      <p className="text-sm text-zinc-500">
        Page {page} of {totalPages} ({total} {label})
      </p>
      <div className="flex gap-2">
        {page > 1 && (
          <Link
            href={href(page - 1)}
            className="inline-flex min-h-[44px] items-center rounded-lg border px-4 py-2 text-sm font-semibold"
          >
            Prev
          </Link>
        )}
        {page < totalPages && (
          <Link
            href={href(page + 1)}
            className="inline-flex min-h-[44px] items-center rounded-lg border px-4 py-2 text-sm font-semibold"
          >
            Next
          </Link>
        )}
      </div>
    </div>
  )
}

/** Ambil nomor halaman dari searchParams (min 1). */
export function parsePage(value: string | string[] | undefined): number {
  const n = parseInt(typeof value === 'string' ? value : '', 10)
  return Number.isFinite(n) && n > 0 ? n : 1
}

/** Potong array hasil filter in-memory menjadi satu halaman. */
export function paginate<T>(items: T[], page: number, pageSize: number): { pageItems: T[]; totalPages: number } {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const start = (safePage - 1) * pageSize
  return {
    pageItems: items.slice(start, start + pageSize),
    totalPages,
  }
}
