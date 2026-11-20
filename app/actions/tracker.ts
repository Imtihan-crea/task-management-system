'use server'

import { revalidatePath } from 'next/cache'
import { requireProfile } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { readLimitedField } from '@/lib/forms/limits'
import { loadReferences, loadTrackerProjects } from '@/lib/hr/data'
import { normalizeText, resolveChoice, sameText, type ReferenceRow } from '@/lib/hr/reference'
import { durationMinutes, findOverlap } from '@/lib/hr/tracker'
import { todayISO } from '@/lib/utils/dates'
import { toForm } from '@/lib/bulk'
import { bulk } from '@/lib/bulk-server'

export type TrackerFormState = { error?: string; success?: string } | undefined

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

type Existing = {
  id: string
  project_id: string | null
  project_name: string
  category_ref: string | null
  location_ref: string | null
  internal_project_ref: string | null
}

/**
 * Pilihan master atau teks bebas (keputusan pemilik 16 Nov 2026: staf boleh
 * mengetik; teksnya jadi usulan di Master Reference). Pilihan arsip ditolak
 * untuk isian baru, kecuali entri yang diubah memang sudah memakainya.
 */
function pick(typed: string, rows: ReferenceRow[], keepRef: string | null, field: string) {
  const c = resolveChoice(typed, rows)
  if (c.kind === 'empty') return { error: `${field} wajib diisi.` }
  if (c.kind === 'archived' && c.ref.id !== keepRef) return { error: `${field} "${c.ref.label}" sudah diarsipkan; pilih yang lain.` }
  if (c.kind === 'free') return { text: c.text, ref: null }
  return { text: c.ref.label, ref: c.ref.id }
}

/**
 * Isi / ubah aktivitas Daily Tracker milik sendiri (HR Tahap 1, migrasi 021/022).
 * Validasi: tanggal tidak di masa depan, jam selesai sesudah jam mulai (lewat
 * tengah malam dipecah 2 entri), tidak tumpang tindih dengan entri lain di hari itu.
 * Tidak dicatat ke Activity Log: satu orang bisa belasan entri per hari.
 */
export async function saveWorkLog(_prev: TrackerFormState, formData: FormData): Promise<TrackerFormState> {
  const profile = await requireProfile()
  const id = readLimitedField(formData, 'id')
  const workDate = readLimitedField(formData, 'work_date')
  const projectTyped = normalizeText(readLimitedField(formData, 'project'))
  const activity = readLimitedField(formData, 'activity')
  const detail = readLimitedField(formData, 'detail')
  const start = readLimitedField(formData, 'start_time')
  const end = readLimitedField(formData, 'end_time')
  const locationTyped = readLimitedField(formData, 'location')
  const categoryTyped = readLimitedField(formData, 'category')
  const output = readLimitedField(formData, 'output')

  if (!DATE_RE.test(workDate) || Number.isNaN(Date.parse(workDate))) return { error: 'Tanggal tidak valid.' }
  if (workDate > todayISO()) return { error: 'Tanggal tidak boleh di masa depan.' }
  if (!activity) return { error: 'Aktivitas wajib diisi.' }
  // Sheet Daily Tracker: semua kolom wajib kecuali durasi (keputusan pemilik 20 Nov 2026).
  if (!detail.trim()) return { error: 'Detail Pekerjaan wajib diisi.' }
  if (!output.trim()) return { error: 'Output/Deliverables wajib diisi.' }
  if (projectTyped.length > 150) return { error: 'Nama proyek paling panjang 150 karakter.' }
  if (normalizeText(locationTyped).length > 60) return { error: 'Lokasi paling panjang 60 karakter.' }
  if (durationMinutes(start, end) === null) {
    return { error: 'Jam selesai harus sesudah jam mulai. Aktivitas lewat tengah malam dicatat sebagai dua entri.' }
  }

  const admin = createAdminClient()
  let existing: Existing | null = null
  if (id) {
    const { data } = await admin
      .from('work_logs')
      .select('id, project_id, project_name, category_ref, location_ref, internal_project_ref')
      .eq('id', id)
      .eq('user_id', profile.id)
      .maybeSingle<Existing>()
    if (!data) return { error: 'Entri tidak ditemukan.' }
    existing = data
  }

  const [refs, projects] = await Promise.all([
    loadReferences(['ACTIVITY_CATEGORY', 'WORK_LOCATION', 'INTERNAL_PROJECT']),
    loadTrackerProjects(),
  ])
  const of = (list: ReferenceRow['list']) => refs.filter((r) => r.list === list)
  const category = pick(categoryTyped, of('ACTIVITY_CATEGORY'), existing?.category_ref ?? null, 'Kategori')
  if ('error' in category) return { error: category.error }
  const location = pick(locationTyped, of('WORK_LOCATION'), existing?.location_ref ?? null, 'Lokasi')
  if ('error' in location) return { error: location.error }

  // Proyek: project TMS aktif > project lama entri ini > proyek internal master > teks bebas.
  let project: { project_id: string | null; internal_project_ref: string | null; project_name: string }
  const tms =
    projects.find((p) => sameText(p.name, projectTyped)) ??
    (existing?.project_id && sameText(existing.project_name, projectTyped)
      ? { id: existing.project_id, name: existing.project_name }
      : undefined)
  if (tms) project = { project_id: tms.id, internal_project_ref: null, project_name: tms.name }
  else {
    const internal = pick(projectTyped, of('INTERNAL_PROJECT'), existing?.internal_project_ref ?? null, 'Proyek')
    if ('error' in internal) return { error: internal.error }
    project = { project_id: null, internal_project_ref: internal.ref, project_name: internal.text }
  }

  const { data: sameDay, error: readError } = await admin
    .from('work_logs')
    .select('id, start_time, end_time')
    .eq('user_id', profile.id)
    .eq('work_date', workDate)
  if (readError) {
    console.error('saveWorkLog read failed:', readError.message)
    return { error: 'Gagal menyimpan. Silakan coba lagi.' }
  }
  const clash = findOverlap(
    ((sameDay ?? []) as { id: string; start_time: string; end_time: string }[]).map((r) => ({
      id: r.id,
      start: r.start_time,
      end: r.end_time,
    })),
    { id: id || undefined, start, end }
  )
  if (clash) {
    return { error: `Jam bentrok dengan aktivitas lain ${clash.start.slice(0, 5)}–${clash.end.slice(0, 5)} di tanggal yang sama.` }
  }

  const row = {
    work_date: workDate,
    ...project,
    activity,
    detail: detail || null,
    start_time: start,
    end_time: end,
    location: location.text,
    location_ref: location.ref,
    category: category.text,
    category_ref: category.ref,
    output: output || null,
    // Entri import yang diubah karyawan jadi APP: import ulang tidak menimpanya (review 16 Nov 2026).
    source: 'APP',
    updated_at: new Date().toISOString(),
  }
  const { error } = id
    ? await admin.from('work_logs').update(row).eq('id', id).eq('user_id', profile.id)
    : await admin.from('work_logs').insert({ ...row, user_id: profile.id })
  if (error) {
    console.error('saveWorkLog failed:', error.message)
    return { error: 'Gagal menyimpan. Silakan coba lagi.' }
  }
  revalidatePath('/tracker')
  const free = [project.project_id || project.internal_project_ref ? null : 'proyek', category.ref ? null : 'kategori', location.ref ? null : 'lokasi'].filter(Boolean)
  const note = free.length ? ` Isian ${free.join(', ')} di luar daftar dicatat sebagai usulan untuk atasan.` : ''
  return { success: (id ? 'Aktivitas diperbarui.' : 'Aktivitas dicatat.') + note }
}

export async function deleteWorkLog(_prev: TrackerFormState, formData: FormData): Promise<TrackerFormState> {
  const profile = await requireProfile()
  const id = readLimitedField(formData, 'id')
  const { data, error } = await createAdminClient()
    .from('work_logs')
    .delete()
    .eq('id', id)
    .eq('user_id', profile.id)
    .select('id')
  if (error || !data?.length) return { error: 'Entri tidak ditemukan.' }
  revalidatePath('/tracker')
  return { success: 'Aktivitas dihapus.' }
}

/** Aksi massal (19 Nov 2026): hapus banyak catatan sendiri lewat deleteWorkLog (hanya milik sendiri). */
export async function bulkDeleteWorkLogs(ids: unknown) {
  return bulk(ids, (id) => deleteWorkLog(undefined, toForm({ id })), 'dihapus')
}
