/**
 * Client Management (migrasi 025): tahap pipeline, transisi, dan validasi input.
 * Murni supaya bisa dites (tests/clients.check.ts).
 */

export type LeadStage = 'LEAD' | 'POTENSIAL' | 'PROPOSAL' | 'NEGOSIASI' | 'DEAL' | 'BATAL'

export const STAGES: { value: LeadStage; label: string }[] = [
  { value: 'LEAD', label: 'Lead masuk' },
  { value: 'POTENSIAL', label: 'Potensial' },
  { value: 'PROPOSAL', label: 'Proposal' },
  { value: 'NEGOSIASI', label: 'Negosiasi' },
  { value: 'DEAL', label: 'Deal' },
  { value: 'BATAL', label: 'Batal' },
]
export const STAGE_LABEL = Object.fromEntries(STAGES.map((s) => [s.value, s.label])) as Record<LeadStage, string>
export const isStage = (v: string): v is LeadStage => v in STAGE_LABEL

/**
 * Tahap tujuan yang boleh dari satu tahap:
 * - Tahap terbuka (Lead, Potensial, Proposal, Negosiasi): ke tahap lain mana pun (maju, mundur, lompat, Batal).
 * - Deal: final, tidak berpindah lagi (project sudah/akan dibuat dari sini).
 * - Batal: hanya dibuka lagi ke Lead masuk.
 */
export function allowedTargets(from: LeadStage): LeadStage[] {
  if (from === 'DEAL') return []
  if (from === 'BATAL') return ['LEAD']
  return STAGES.map((s) => s.value).filter((s) => s !== from)
}

export const canMove = (from: LeadStage, to: LeadStage) => allowedTargets(from).includes(to)

export type LeadInput = {
  company_name: string
  contact_name: string | null
  contact_email: string | null
  contact_phone: string | null
  source: string | null
  estimated_value: number
  notes: string | null
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
/** Angka telepon boleh berawalan +, berisi spasi, tanda hubung, dan kurung; minimal 6 digit. */
const PHONE = /^\+?[\d\s\-()]+$/
/** numeric(16,2): paling banyak 14 digit di depan koma. */
export const MAX_VALUE = 99_999_999_999_999

export function emailError(v: string | null): string | null {
  if (!v) return null
  if (v.length > 254 || !EMAIL.test(v)) return 'Format email kontak tidak valid.'
  return null
}

export function phoneError(v: string | null): string | null {
  if (!v) return null
  if (v.length > 30 || !PHONE.test(v) || v.replace(/\D/g, '').length < 6) return 'Format telepon kontak tidak valid (angka, minimal 6 digit).'
  return null
}

/** Teks nilai Rupiah dari form -> angka; kosong = 0. Kembali string error bila tidak sah. */
export function parseValue(raw: string): number | string {
  const t = raw.trim()
  if (!t) return 0
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return 'Perkiraan nilai harus angka nol atau lebih, tanpa pemisah ribuan.'
  const n = Number(t)
  if (!Number.isFinite(n) || n < 0 || n > MAX_VALUE) return 'Perkiraan nilai di luar batas.'
  return n
}

/** Validasi isian lead (tambah/ubah). Mengembalikan pesan pertama yang salah, atau null. */
export function leadError(i: LeadInput): string | null {
  if (!i.company_name.trim()) return 'Nama perusahaan wajib diisi.'
  if (!Number.isFinite(i.estimated_value) || i.estimated_value < 0 || i.estimated_value > MAX_VALUE) return 'Perkiraan nilai tidak boleh negatif.'
  return emailError(i.contact_email) ?? phoneError(i.contact_phone)
}

/** Validasi pindah tahap: transisi sah, dan alasan wajib untuk Batal. */
export function stageChangeError(from: LeadStage, to: LeadStage, lostReason: string | null): string | null {
  if (from === to) return 'Lead sudah berada di tahap itu.'
  if (!canMove(from, to)) return `Lead di tahap ${STAGE_LABEL[from]} tidak bisa dipindah ke ${STAGE_LABEL[to]}.`
  if (to === 'BATAL' && !lostReason?.trim()) return 'Alasan batal wajib diisi.'
  return null
}

export type StageSummary = { stage: LeadStage; count: number; total: number }

/** Ringkasan jumlah dan total nilai per tahap (semua tahap, urut pipeline). */
export function summarize(rows: { stage: LeadStage; estimated_value: number }[]): StageSummary[] {
  return STAGES.map(({ value }) => {
    const inStage = rows.filter((r) => r.stage === value)
    return { stage: value, count: inStage.length, total: inStage.reduce((a, r) => a + Number(r.estimated_value), 0) }
  })
}

export const rupiah = (n: number) => `Rp ${new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(n)}`
