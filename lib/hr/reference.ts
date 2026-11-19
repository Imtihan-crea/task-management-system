/**
 * Master Reference (migrasi 022): aturan murni supaya bisa dites.
 * Aturan dari FMS/IMS (ADR 0074/0076) + keputusan pemilik 16 Nov 2026:
 * - tidak ada hapus, hanya arsip; kode tetap sejak dibuat;
 * - label hanya boleh ditambah (label lama wajib tetap termuat);
 * - label unik per daftar tanpa membedakan huruf besar-kecil;
 * - teks bebas staf tetap tersimpan dan menjadi usulan untuk dikukuhkan.
 */

export type ReferenceList = 'ACTIVITY_CATEGORY' | 'WORK_LOCATION' | 'DIVISION' | 'POSITION' | 'INTERNAL_PROJECT' | 'LEAVE_TYPE'

/** Urutan = urutan tab di halaman Master Reference. */
export const REFERENCE_LISTS: { list: ReferenceList; title: string; hint: string; freeText: boolean }[] = [
  { list: 'ACTIVITY_CATEGORY', title: 'Kategori aktivitas', hint: 'Pilihan kategori di Daily Tracker.', freeText: true },
  { list: 'WORK_LOCATION', title: 'Lokasi kerja', hint: 'Pilihan lokasi di Daily Tracker.', freeText: true },
  { list: 'DIVISION', title: 'Divisi', hint: 'Divisi karyawan di profil.', freeText: false },
  { list: 'POSITION', title: 'Jabatan', hint: 'Jabatan karyawan di profil.', freeText: false },
  { list: 'INTERNAL_PROJECT', title: 'Proyek internal', hint: 'Pekerjaan di luar project TMS (mis. urusan kantor, calon klien); tampil di pilihan proyek Daily Tracker.', freeText: true },
  { list: 'LEAVE_TYPE', title: 'Jenis cuti', hint: 'Pilihan jenis di form Cuti, beserta aturan hitungnya. Cuti Khusus (kode KHUSUS) tetap wajib memilih alasan menurut UU.', freeText: false },
]

/** Daftar yang dibuka bila ?tab= kosong atau tidak dikenal. */
export const DEFAULT_REFERENCE_LIST: ReferenceList = REFERENCE_LISTS[0].list

export const isReferenceList = (v: string): v is ReferenceList => REFERENCE_LISTS.some((l) => l.list === v)

export type ReferenceRow = {
  id: string
  list: ReferenceList
  code: string
  label: string
  description: string | null
  sort_order: number
  archived_at: string | null
  /** Atribut jenis cuti; null di daftar lain (migrasi 027). */
  counts_hours?: boolean | null
  uses_quota?: boolean | null
  max_days?: number | null
}

export type LeaveAttrs = { counts_hours: boolean; uses_quota: boolean; max_days: number | null }

export const MAX_DAYS_LIMIT = 366

/** Batas hari per pengajuan dari isian form: kosong = tanpa batas; selain itu bilangan bulat 1..366. */
export function parseMaxDays(raw: string): { value: number | null } | { error: string } {
  const t = raw.trim()
  if (!t) return { value: null }
  const n = Number(t)
  if (!/^\d+$/.test(t) || n < 1 || n > MAX_DAYS_LIMIT) return { error: `Batas hari harus bilangan bulat 1 sampai ${MAX_DAYS_LIMIT}, atau kosong.` }
  return { value: n }
}

/** Ringkas perubahan atribut untuk activity log; '' bila tidak berubah. */
export function attrChanges(before: LeaveAttrs, after: LeaveAttrs): string {
  const yn = (b: boolean) => (b ? 'ya' : 'tidak')
  const days = (n: number | null) => (n === null ? 'tanpa batas' : `${n} hari`)
  const out: string[] = []
  if (before.counts_hours !== after.counts_hours) out.push(`dihitung jam kerja: ${yn(before.counts_hours)} jadi ${yn(after.counts_hours)}`)
  if (before.uses_quota !== after.uses_quota) out.push(`memotong jatah: ${yn(before.uses_quota)} jadi ${yn(after.uses_quota)}`)
  if (before.max_days !== after.max_days) out.push(`batas hari: ${days(before.max_days)} jadi ${days(after.max_days)}`)
  return out.join('; ')
}

/** Rapikan spasi; dipakai sebelum membandingkan atau menyimpan label/teks bebas. */
export const normalizeText = (s: string) => s.replace(/\s+/g, ' ').trim()
const key = (s: string) => normalizeText(s).toLocaleLowerCase('id-ID')

export const LABEL_MAX = 80

export function labelError(label: string): string | null {
  const l = normalizeText(label)
  if (!l) return 'Label wajib diisi.'
  if (l.length > LABEL_MAX) return `Label paling panjang ${LABEL_MAX} karakter.`
  return null
}

/** Label baru harus tetap memuat label lama (hanya boleh menambah). */
export function renameError(oldLabel: string, newLabel: string): string | null {
  const err = labelError(newLabel)
  if (err) return err
  if (!key(newLabel).includes(key(oldLabel))) {
    return `Label hanya boleh ditambah, tidak diganti. "${oldLabel}" harus tetap ada di label baru.`
  }
  return null
}

/** Label sudah dipakai pilihan lain di daftar yang sama (termasuk yang diarsipkan)? */
export function duplicateLabel<T extends Pick<ReferenceRow, 'id' | 'label'>>(rows: T[], label: string, exceptId?: string): T | null {
  return rows.find((r) => r.id !== exceptId && key(r.label) === key(label)) ?? null
}

/** Kode dari label: HURUF_BESAR_ANGKA, unik di daftar (akhiran _2, _3, ...). */
export function codeFromLabel(label: string, existingCodes: string[]): string {
  const base =
    normalizeText(label)
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 50) || 'PILIHAN'
  const taken = new Set(existingCodes)
  if (!taken.has(base)) return base
  for (let n = 2; ; n++) if (!taken.has(`${base}_${n}`)) return `${base}_${n}`
}

/** Urutan pilihan baru: di bawah yang sudah ada. */
export const nextSortOrder = (rows: Pick<ReferenceRow, 'sort_order'>[]) =>
  rows.reduce((m, r) => Math.max(m, r.sort_order), 0) + 10

export type Choice =
  | { kind: 'empty' }
  | { kind: 'ref'; ref: ReferenceRow }
  | { kind: 'archived'; ref: ReferenceRow }
  | { kind: 'free'; text: string }

/** Cocokkan ketikan ke pilihan master (tanpa beda huruf besar-kecil). */
export function resolveChoice(typed: string, rows: ReferenceRow[]): Choice {
  const text = normalizeText(typed)
  if (!text) return { kind: 'empty' }
  const ref = rows.find((r) => key(r.label) === key(text))
  if (!ref) return { kind: 'free', text }
  return ref.archived_at ? { kind: 'archived', ref } : { kind: 'ref', ref }
}

export type Suggestion = { text: string; count: number; lastDate: string }

/** Kelompokkan teks bebas (tanpa beda huruf besar-kecil), urut terbanyak. */
export function groupFreeText(rows: { text: string; date: string }[]): Suggestion[] {
  const map = new Map<string, Suggestion>()
  for (const r of rows) {
    const k = key(r.text)
    if (!k) continue
    const cur = map.get(k)
    if (cur) {
      cur.count++
      if (r.date > cur.lastDate) cur.lastDate = r.date
    } else map.set(k, { text: normalizeText(r.text), count: 1, lastDate: r.date })
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.text.localeCompare(b.text))
}

export const sameText = (a: string, b: string) => key(a) === key(b)
