/**
 * Aksi massal (pilih satu / sebagian / semua): logika murni bersama.
 *
 * Aturan: aksi massal TIDAK punya logika izin sendiri. Tiap item diproses
 * dengan memanggil aksi satuan yang sudah ada (izin, activity log,
 * notifikasi persis sama), lalu hasilnya diringkas di sini.
 */

/** Batas item per sekali aksi massal (dan per export terpilih). */
export const BULK_MAX = 200

// uuid, angka, atau base64url (mis. teks bebas Master Reference yang dikodekan).
const ID_RE = /^[0-9A-Za-z_-]{1,256}$/

/** Daftar id dari klien (tidak tepercaya): array string valid, unik, 1..BULK_MAX. String = pesan error. */
export function parseBulkIds(raw: unknown, max = BULK_MAX): string[] | string {
  if (!Array.isArray(raw)) return 'Pilih minimal satu item.'
  if (raw.length === 0) return 'Pilih minimal satu item.'
  if (!raw.every((v) => typeof v === 'string' && ID_RE.test(v))) return 'Pilihan tidak valid.'
  const ids = [...new Set(raw as string[])]
  if (ids.length > max) return `Maksimal ${max} item sekali proses. Kurangi pilihan.`
  return ids
}

/** Nilai isian aksi massal (mis. status baru) dari klien: hanya string. */
export function readInput(input: unknown, key: string): string {
  if (!input || typeof input !== 'object') return ''
  const v = (input as Record<string, unknown>)[key]
  return typeof v === 'string' ? v : ''
}

/** Objek -> FormData untuk memanggil aksi satuan apa adanya. Nilai array = field berulang. */
export function toForm(fields: Record<string, string | string[] | null | undefined>): FormData {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) {
    if (Array.isArray(v)) v.forEach((x) => fd.append(k, x))
    else fd.set(k, v ?? '')
  }
  return fd
}

/** Hasil satu item = bentuk state aksi satuan. undefined/void = dianggap berhasil (mis. aksi yang tidak mengembalikan apa-apa). */
export type ItemOutcome = { error?: string; success?: string } | undefined | void

export type BulkResult = {
  ok: number
  skipped: number
  message: string
  tone: 'success' | 'warning' | 'error'
}

/** Ringkas hasil per item: "X berhasil, Y dilewati (alasan ×n; ...)". */
export function summarizeBulk(outcomes: ItemOutcome[], verb = 'berhasil'): BulkResult {
  const reasons = new Map<string, number>()
  let ok = 0
  for (const o of outcomes) {
    if (o && o.error) reasons.set(o.error, (reasons.get(o.error) ?? 0) + 1)
    else ok++
  }
  const skipped = outcomes.length - ok
  const list = [...reasons.entries()].sort((a, b) => b[1] - a[1])
  const shown = list.slice(0, 3).map(([r, n]) => (n > 1 ? `${r.replace(/\.$/, '')} (${n})` : r.replace(/\.$/, '')))
  if (list.length > 3) shown.push(`${list.length - 3} alasan lain`)
  const message =
    skipped === 0
      ? `${ok} ${verb}.`
      : `${ok} ${verb}, ${skipped} dilewati: ${shown.join('; ')}.`
  return { ok, skipped, message, tone: skipped === 0 ? 'success' : ok === 0 ? 'error' : 'warning' }
}

/**
 * Jalankan aksi satuan untuk tiap id, BERURUTAN (aturan seperti "minimal satu
 * admin aktif" dicek ulang per item terhadap data terbaru). Error tak terduga
 * pada satu item tidak menghentikan item lain. `rethrow` meneruskan
 * redirect/notFound Next (mis. requirePermission) apa adanya.
 */
export async function runBulk(
  raw: unknown,
  fn: (id: string) => Promise<ItemOutcome>,
  opts: { verb?: string; rethrow?: (e: unknown) => void; max?: number } = {}
): Promise<BulkResult> {
  const ids = parseBulkIds(raw, opts.max)
  if (typeof ids === 'string') return { ok: 0, skipped: 0, message: ids, tone: 'error' }
  const outcomes: ItemOutcome[] = []
  for (const id of ids) {
    try {
      outcomes.push(await fn(id))
    } catch (e) {
      opts.rethrow?.(e)
      console.error('[bulk] item failed:', e instanceof Error ? e.message : e)
      outcomes.push({ error: 'Terjadi kesalahan sistem' })
    }
  }
  return summarizeBulk(outcomes, opts.verb)
}

/** Export terpilih: `?ids=a,b,c` -> Set (maks BULK_MAX), atau null bila tidak ada (export semua sesuai filter). */
export function selectedIds(params: URLSearchParams): Set<string> | null {
  const raw = params.get('ids')
  if (!raw) return null
  return new Set(raw.split(',').filter((v) => ID_RE.test(v)).slice(0, BULK_MAX))
}

/** Saring baris export ke id terpilih; tanpa pilihan = semua. */
export function onlySelected<T>(rows: T[], ids: Set<string> | null, idOf: (row: T) => string = (r) => (r as { id: string }).id): T[] {
  return ids ? rows.filter((r) => ids.has(idOf(r))) : rows
}
