import { normalizeText, resolveChoice, sameText, type ReferenceRow } from '@/lib/hr/reference'
import { findOverlap } from '@/lib/hr/tracker'

/**
 * Parser import histori Daily Tracker (sheet "Daily <Bulan> 26", kolom A-M).
 * Murni (tanpa DB) supaya bisa dites; pembacaan data dan penulisan ada di import-tracker-run.ts.
 */

type Cell = string | number | boolean | Date | null | undefined
export type SheetInput = { sheet: string; data: Cell[][] }

/** Sheet gabungan/ringkasan, bukan data harian. */
const SKIP_SHEETS = new Set(['daily 2025', 'daily 2026', 'daily sum'])

export const isDailySheet = (name: string) => {
  const n = normalizeText(name).toLowerCase()
  return n.startsWith('daily ') && !SKIP_SHEETS.has(n)
}

const text = (v: Cell) => (v === null || v === undefined ? '' : normalizeText(String(v)))
const raw = (v: Cell) => (v === null || v === undefined ? '' : String(v).trim())

/** Date, angka seri Excel, atau teks YYYY-MM-DD / DD/MM/YYYY -> 'YYYY-MM-DD'; null bila tidak valid. */
export function parseDate(v: Cell): string | null {
  let d: Date | null = null
  if (v instanceof Date) d = v
  else if (typeof v === 'number') d = v >= 1 ? new Date(Math.round((Math.floor(v) - 25569) * 86400000)) : null
  else if (typeof v === 'string') {
    const s = v.trim()
    // Tanggal yang tidak ada (31/02) ditolak, bukan digeser Date.UTC ke bulan berikut.
    const exact = (y: number, mo: number, da: number) => {
      const t = new Date(Date.UTC(y, mo - 1, da))
      return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === da ? t : null
    }
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (m) d = exact(+m[1], +m[2], +m[3])
    m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
    if (m) d = exact(+m[3], +m[2], +m[1])
    if (!d) return null
  }
  if (!d || Number.isNaN(d.getTime())) return null
  const iso = d.toISOString().slice(0, 10)
  const year = +iso.slice(0, 4)
  return year >= 2000 && year <= 2100 ? iso : null
}

/** Date 1899-12-30Txx, pecahan hari, atau teks 'H:MM' -> 'HH:MM'; null bila tidak valid. */
export function parseClock(v: Cell): string | null {
  let minutes: number | null = null
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return null
    // Dibulatkan ke menit terdekat (sheet kadang menyimpan selisih detik zona waktu lama).
    minutes = Math.round((v.getUTCHours() * 3600 + v.getUTCMinutes() * 60 + v.getUTCSeconds()) / 60)
  } else if (typeof v === 'number') {
    if (!Number.isFinite(v) || v < 0) return null
    minutes = Math.round((v - Math.floor(v)) * 1440)
  } else if (typeof v === 'string') {
    const m = v.trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/)
    if (m && +m[1] < 24 && +m[2] < 60) minutes = +m[1] * 60 + +m[2]
  }
  if (minutes === null || minutes >= 1440) return null
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
}

export type ImportUser = { id: string; full_name: string | null }
export type ImportProject = { id: string; name: string }

export type ImportLog = {
  user_id: string
  work_date: string
  project_id: string | null
  project_name: string
  internal_project_ref: string | null
  activity: string
  detail: string | null
  start_time: string
  end_time: string
  location: string
  location_ref: string | null
  category: string
  category_ref: string | null
  output: string | null
  source: 'IMPORT'
}

export const EMPTY_CATEGORY = '(tanpa kategori)'
export const EMPTY_LOCATION = '(tanpa lokasi)'

export type SkipReason = 'time' | 'date' | 'future' | 'noName' | 'noProject' | 'tooLong' | 'overlap'
export const SKIP_LABEL: Record<SkipReason, string> = {
  time: 'jam tidak valid/lewat tengah malam',
  date: 'tanggal tidak valid',
  future: 'tanggal di masa depan',
  noName: 'nama kosong',
  noProject: 'proyek kosong',
  tooLong: 'kategori/lokasi lebih dari 60 karakter',
  overlap: 'bentrok jam dengan entri yang diisi di aplikasi',
}

export type ImportContext = {
  users: ImportUser[]
  projects: ImportProject[]
  /** Daftar ACTIVITY_CATEGORY, WORK_LOCATION, INTERNAL_PROJECT (termasuk arsip). */
  refs: ReferenceRow[]
  today: string
}

export type ImportBuild = {
  sheets: string[]
  rows: ImportLog[]
  unknownNames: string[]
  skipped: Record<SkipReason, number>
  /** Jumlah teks bebas yang berbeda per kolom (usulan baru untuk Master Reference). */
  free: { project: number; category: number; location: number }
}

const MAX = { activity: 300, detail: 5000, output: 2000, project: 150, short: 60 }
const cut = (s: string, n: number) => (s.length > n ? s.slice(0, n) : s)

export function buildImport(sheets: SheetInput[], ctx: ImportContext): ImportBuild {
  const skipped = Object.fromEntries(Object.keys(SKIP_LABEL).map((k) => [k, 0])) as Record<SkipReason, number>
  const unknown = new Map<string, string>()
  const freeSets = { project: new Set<string>(), category: new Set<string>(), location: new Set<string>() }
  const rows: ImportLog[] = []
  const used = sheets.filter((s) => isDailySheet(s.sheet))

  const refsOf = (list: ReferenceRow['list']) => ctx.refs.filter((r) => r.list === list)
  const catRefs = refsOf('ACTIVITY_CATEGORY')
  const locRefs = refsOf('WORK_LOCATION')
  const projRefs = refsOf('INTERNAL_PROJECT')

  const findUser = (name: string): string | null => {
    const hit = ctx.users.filter((u) => u.full_name && sameText(u.full_name, name))
    return hit.length === 1 ? hit[0].id : null
  }

  for (const { data } of used) {
    for (const r of data.slice(1)) {
      if (!raw(r[0]) && !raw(r[2])) continue
      const name = text(r[2])
      if (!name) {
        skipped.noName++
        continue
      }
      const userId = findUser(name)
      if (!userId) {
        if (!unknown.has(name.toLocaleLowerCase('id-ID'))) unknown.set(name.toLocaleLowerCase('id-ID'), name)
        continue
      }
      const date = parseDate(r[0])
      if (!date) {
        skipped.date++
        continue
      }
      if (date > ctx.today) {
        skipped.future++
        continue
      }
      const start = parseClock(r[7])
      // Selesai tepat tengah malam ditulis 00:00 di sheet (durasinya positif di sheet): simpan 24:00.
      const rawEnd = parseClock(r[8])
      const end = rawEnd === '00:00' && start && start > '00:00' ? '24:00' : rawEnd
      if (!start || !end || end <= start) {
        skipped.time++
        continue
      }

      const projText = text(r[4])
      // Kategori/lokasi kosong tetap diimport (jamnya ikut terhitung seperti di sheet) sebagai teks bebas.
      const catText = text(r[11]) || EMPTY_CATEGORY
      const locText = text(r[10]) || EMPTY_LOCATION
      if (!projText) {
        skipped.noProject++
        continue
      }
      if (catText.length > MAX.short || locText.length > MAX.short) {
        skipped.tooLong++
        continue
      }

      const tms = ctx.projects.find((p) => sameText(p.name, projText))
      const internal = tms ? null : resolveChoice(projText, projRefs)
      const cat = resolveChoice(catText, catRefs)
      const loc = resolveChoice(locText, locRefs)
      const refOf = (c: ReturnType<typeof resolveChoice>) => (c.kind === 'ref' || c.kind === 'archived' ? c.ref : null)

      const iRef = internal ? refOf(internal) : null
      const cRef = refOf(cat)
      const lRef = refOf(loc)
      if (!tms && !iRef) freeSets.project.add(projText.toLocaleLowerCase('id-ID'))
      if (!cRef) freeSets.category.add(catText.toLocaleLowerCase('id-ID'))
      if (!lRef) freeSets.location.add(locText.toLocaleLowerCase('id-ID'))

      const detail = raw(r[6])
      const output = raw(r[12])
      rows.push({
        user_id: userId,
        work_date: date,
        project_id: tms?.id ?? null,
        project_name: cut(tms?.name ?? iRef?.label ?? projText, MAX.project),
        internal_project_ref: iRef?.id ?? null,
        activity: cut(text(r[5]) || '-', MAX.activity),
        detail: detail ? cut(detail, MAX.detail) : null,
        start_time: start,
        end_time: end,
        location: lRef?.label ?? locText,
        location_ref: lRef?.id ?? null,
        category: cRef?.label ?? catText,
        category_ref: cRef?.id ?? null,
        output: output ? cut(output, MAX.output) : null,
        source: 'IMPORT',
      })
    }
  }

  return {
    sheets: used.map((s) => s.sheet),
    rows,
    unknownNames: [...unknown.values()].sort((a, b) => a.localeCompare(b, 'id')),
    skipped,
    free: { project: freeSets.project.size, category: freeSets.category.size, location: freeSets.location.size },
  }
}

export type AppEntry = { user_id: string; work_date: string; start_time: string; end_time: string }

/**
 * Buang baris import yang bentrok jam dengan entri yang diisi di aplikasi
 * (source APP), supaya jam tidak terhitung dua kali. Bentrok antar baris
 * berkas sendiri dibiarkan: histori disalin apa adanya agar total = sheet.
 */
export function dropAppOverlaps(b: ImportBuild, app: AppEntry[]): ImportBuild {
  const byDay = new Map<string, { start: string; end: string }[]>()
  for (const a of app) {
    const k = `${a.user_id}|${a.work_date}`
    byDay.set(k, [...(byDay.get(k) ?? []), { start: a.start_time, end: a.end_time }])
  }
  const rows = b.rows.filter((r) => !findOverlap(byDay.get(`${r.user_id}|${r.work_date}`) ?? [], { start: r.start_time, end: r.end_time }))
  return { ...b, rows, skipped: { ...b.skipped, overlap: b.skipped.overlap + b.rows.length - rows.length } }
}

/** Tanggal per user yang ada di berkas: hanya tanggal ini yang diganti saat import ulang. */
export function datesByUser(rows: ImportLog[]): Map<string, string[]> {
  const out = new Map<string, Set<string>>()
  for (const r of rows) out.set(r.user_id, (out.get(r.user_id) ?? new Set()).add(r.work_date))
  return new Map([...out].map(([u, s]) => [u, [...s].sort()]))
}

/** Rentang tanggal per user dari baris yang diterima (untuk ringkasan). */
export function rangesByUser(rows: ImportLog[]): Map<string, { from: string; to: string }> {
  const out = new Map<string, { from: string; to: string }>()
  for (const r of rows) {
    const cur = out.get(r.user_id)
    if (!cur) out.set(r.user_id, { from: r.work_date, to: r.work_date })
    else {
      if (r.work_date < cur.from) cur.from = r.work_date
      if (r.work_date > cur.to) cur.to = r.work_date
    }
  }
  return out
}

export function summarize(b: ImportBuild): string {
  const people = new Set(b.rows.map((r) => r.user_id)).size
  const dates = b.rows.map((r) => r.work_date).sort()
  const range = dates.length ? ` (${dates[0]} s/d ${dates[dates.length - 1]})` : ''
  const skip = (Object.keys(SKIP_LABEL) as SkipReason[])
    .filter((k) => b.skipped[k] > 0)
    .map((k) => `${b.skipped[k]} ${SKIP_LABEL[k]}`)
  const parts = [`${b.rows.length} aktivitas diimport untuk ${people} orang${range}.`]
  parts.push(skip.length ? `Dilewati: ${skip.join(', ')}.` : 'Tidak ada baris yang dilewati.')
  const free = [
    b.free.project && `${b.free.project} proyek`,
    b.free.category && `${b.free.category} kategori`,
    b.free.location && `${b.free.location} lokasi`,
  ].filter(Boolean)
  if (free.length) parts.push(`Teks bebas (usulan baru untuk Master Reference): ${free.join(', ')}.`)
  return parts.join(' ')
}

/* ---------- Leave Form (HR Tahap 2) ---------- */

export type ImportLeave = { user_id: string; kind: 'CUTI' | 'IZIN' | 'SAKIT'; date: string; reason: string | null }
export type ImportEmployee = { user_id: string; join_date: string | null; quota: number | null }
export type LeaveBuild = { leave: ImportLeave[]; employees: ImportEmployee[]; unknownNames: string[]; skipped: number; unmatchedEmployees: string[] }

const LEAVE_KIND: Record<string, ImportLeave['kind']> = { cuti: 'CUTI', izin: 'IZIN', sakit: 'SAKIT' }

/**
 * Sheet "Leave Form": kiri = log per hari (A Tanggal, C Nama, E Kategori, F Keterangan),
 * kanan = data per orang (H Nama, I Tanggal Masuk, K Hak Cuti Tahunan). "Cuti Diambil"
 * (manual di sheet) tidak dibaca: di aplikasi dihitung dari cuti yang disetujui.
 * Log diimport sebagai pengajuan DISETUJUI (keputusan pemilik 16 Nov 2026).
 */
export function buildLeaveImport(sheets: SheetInput[], ctx: Pick<ImportContext, 'users' | 'today'>): LeaveBuild {
  const data = sheets.find((s) => normalizeText(s.sheet).toLowerCase() === 'leave form')?.data ?? []
  const unknown = new Map<string, string>()
  const findUser = (name: string) => {
    const hit = ctx.users.filter((u) => u.full_name && sameText(u.full_name, name))
    if (hit.length === 1) return hit[0].id
    unknown.set(name.toLocaleLowerCase('id-ID'), name)
    return null
  }
  // Bagian kanan memakai nama lengkap resmi (mis. "Muhammad Diaz Ilyasa" vs profil "Diaz Ilyasa"):
  // cocok bila semua kata nama profil ada di nama sheet, dan hanya satu profil yang cocok.
  const words = (s: string) => normalizeText(s).toLocaleLowerCase('id-ID').split(' ')
  const findLoose = (name: string) => {
    const exact = ctx.users.filter((u) => u.full_name && sameText(u.full_name, name))
    if (exact.length === 1) return exact[0].id
    const have = new Set(words(name))
    const hit = ctx.users.filter((u) => u.full_name && words(u.full_name).every((w) => have.has(w)))
    return hit.length === 1 ? hit[0].id : null
  }
  const unmatched: string[] = []
  const leave: ImportLeave[] = []
  const employees: ImportEmployee[] = []
  let skipped = 0
  for (const r of data.slice(1)) {
    const name = text(r[2])
    if (name) {
      const userId = findUser(name)
      const date = parseDate(r[0])
      const kind = LEAVE_KIND[text(r[4]).toLowerCase()]
      if (userId && date && kind && date <= ctx.today) leave.push({ user_id: userId, kind, date, reason: text(r[5]) ? cut(text(r[5]), 1000) : null })
      else if (userId) skipped++
    }
    const right = text(r[7])
    if (right) {
      const userId = findLoose(right)
      if (!userId) unmatched.push(right)
      const q = r[10] === null || r[10] === undefined || r[10] === '' ? null : Number(r[10])
      if (userId) employees.push({ user_id: userId, join_date: parseDate(r[8]), quota: q !== null && Number.isInteger(q) && q >= 0 && q <= 60 ? q : null })
    }
  }
  return { leave, employees, unknownNames: [...unknown.values()].sort((a, b) => a.localeCompare(b, 'id')), skipped, unmatchedEmployees: unmatched }
}
