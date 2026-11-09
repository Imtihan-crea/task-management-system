/**
 * Ambil semua baris per halaman 1000 (batas PostgREST memotong tanpa error).
 * Error dilempar: lebih baik cron gagal dan dicoba lagi daripada peserta
 * terlewat atau notifikasi terkirim ganda.
 */
export async function allRows<T>(
  page: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>
): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await page(from, from + 999)
    if (error) throw new Error(`[allRows] query gagal: ${error.message}`)
    const rows = (data ?? []) as T[]
    out.push(...rows)
    if (rows.length < 1000) return out
  }
}
