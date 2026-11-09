import { TASK_PRIORITIES, TASK_STATUSES } from '@/lib/auth/roles'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Filter dari URL yang mustahil cocok (bukan UUID / bukan enum). Dulu PostgREST
 * menolak (22P02) dan error-nya diabaikan sehingga daftar kosong; sejak allRows
 * melempar error, nilai seperti itu membuat halaman crash. Pemanggil cukup
 * mengembalikan daftar kosong, sama dengan perilaku lama.
 */
export function hasImpossibleFilter(f: {
  ids?: (string | null | undefined)[]
  status?: string | null
  priority?: string | null
}): boolean {
  if ((f.ids ?? []).some((v) => !!v && !UUID.test(v))) return true
  if (f.status && !(TASK_STATUSES as string[]).includes(f.status)) return true
  if (f.priority && !(TASK_PRIORITIES as string[]).includes(f.priority)) return true
  return false
}
