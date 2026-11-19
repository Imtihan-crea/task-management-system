'use server'

import { revalidatePath } from 'next/cache'
import { requirePermission } from '@/lib/auth/current-access'
import { createAdminClient } from '@/lib/supabase/admin'
import { logActivity } from '@/lib/activity-log/service'
import { readLimitedField } from '@/lib/forms/limits'
import { loadReferences } from '@/lib/hr/data'
import { allRows } from '@/lib/utils/paginate'
import {
  REFERENCE_LISTS, attrChanges, codeFromLabel, duplicateLabel, isReferenceList, labelError, nextSortOrder, normalizeText, parseMaxDays, renameError, sameText,
  type LeaveAttrs, type ReferenceList, type ReferenceRow,
} from '@/lib/hr/reference'

export type ReferenceFormState = { error?: string; success?: string } | undefined

const listTitle = (list: ReferenceList) => REFERENCE_LISTS.find((l) => l.list === list)!.title
const DESC_MAX = 500
const COLUMNS = 'id, list, code, label, description, sort_order, archived_at, counts_hours, uses_quota, max_days'

/** Kolom work_logs yang memuat teks bebas & tautan master per daftar (null = tidak dipakai tracker). */
const LOG_COLUMNS: Partial<Record<ReferenceList, { text: string; ref: string }>> = {
  ACTIVITY_CATEGORY: { text: 'category', ref: 'category_ref' },
  WORK_LOCATION: { text: 'location', ref: 'location_ref' },
  INTERNAL_PROJECT: { text: 'project_name', ref: 'internal_project_ref' },
}


function readDescription(formData: FormData): string | null | Error {
  const d = normalizeText(String(formData.get('description') ?? ''))
  if (d.length > DESC_MAX) return new Error(`Penjelasan paling panjang ${DESC_MAX} karakter.`)
  return d || null
}

/** Atribut jenis cuti dari form (centang + batas hari); hanya untuk daftar LEAVE_TYPE. */
function readLeaveAttrs(formData: FormData): LeaveAttrs | Error {
  const max = parseMaxDays(String(formData.get('max_days') ?? ''))
  if ('error' in max) return new Error(max.error)
  return { counts_hours: formData.get('counts_hours') === 'on', uses_quota: formData.get('uses_quota') === 'on', max_days: max.value }
}

async function insertReference(list: ReferenceList, label: string, description: string | null, actorId: string, attrs?: LeaveAttrs) {
  const rows = (await loadReferences([list]))
  const dup = duplicateLabel(rows, label)
  if (dup) {
    return { error: dup.archived_at ? `"${dup.label}" sudah ada di arsip; aktifkan lagi dari daftar arsip.` : `"${dup.label}" sudah ada.` }
  }
  const { data, error } = await createAdminClient()
    .from('master_references')
    .insert({
      list,
      code: codeFromLabel(label, rows.map((r) => r.code)),
      label,
      description,
      sort_order: nextSortOrder(rows),
      created_by: actorId,
      ...(attrs ?? {}),
    })
    .select(COLUMNS)
    .single<ReferenceRow>()
  if (error) {
    console.error('insertReference failed:', error.message)
    return { error: 'Gagal menyimpan pilihan. Silakan coba lagi.' }
  }
  return { row: data }
}

export async function addReference(_prev: ReferenceFormState, formData: FormData): Promise<ReferenceFormState> {
  const actor = await requirePermission('reference.manage')
  const list = readLimitedField(formData, 'list')
  if (!isReferenceList(list)) return { error: 'Daftar tidak dikenal.' }
  const label = normalizeText(readLimitedField(formData, 'label'))
  const err = labelError(label)
  if (err) return { error: err }
  const description = readDescription(formData)
  if (description instanceof Error) return { error: description.message }

  const attrs = list === 'LEAVE_TYPE' ? readLeaveAttrs(formData) : undefined
  if (attrs instanceof Error) return { error: attrs.message }

  const res = await insertReference(list, label, description, actor.id, attrs)
  if ('error' in res) return { error: res.error }
  await logActivity({
    actorUserId: actor.id,
    action: 'REFERENCE_ADDED',
    entityType: 'master_reference',
    entityId: res.row.id,
    metadata: { list, list_title: listTitle(list), code: res.row.code, label, ...(attrs ?? {}) },
  })
  revalidatePath('/master-reference')
  return { success: `"${label}" ditambahkan.` }
}

/** Ubah label (hanya menambah) dan/atau penjelasan. Kode tidak pernah berubah. */
export async function updateReference(_prev: ReferenceFormState, formData: FormData): Promise<ReferenceFormState> {
  const actor = await requirePermission('reference.manage')
  const id = readLimitedField(formData, 'id')
  const label = normalizeText(readLimitedField(formData, 'label'))
  const description = readDescription(formData)
  if (description instanceof Error) return { error: description.message }

  const admin = createAdminClient()
  const { data: row } = await admin
    .from('master_references')
    .select(COLUMNS)
    .eq('id', id)
    .maybeSingle<ReferenceRow>()
  if (!row) return { error: 'Pilihan tidak ditemukan.' }
  const isLeave = row.list === 'LEAVE_TYPE'
  const before: LeaveAttrs = { counts_hours: Boolean(row.counts_hours), uses_quota: Boolean(row.uses_quota), max_days: row.max_days ?? null }
  const attrs = isLeave ? readLeaveAttrs(formData) : null
  if (attrs instanceof Error) return { error: attrs.message }
  const changes = attrs ? attrChanges(before, attrs) : ''
  const err = renameError(row.label, label)
  if (err) return { error: err }
  const dup = duplicateLabel(await loadReferences([row.list]), label, row.id)
  if (dup) return { error: `"${dup.label}" sudah ada di daftar ini.` }
  if (label === row.label && description === row.description && !changes) return { success: 'Tidak ada perubahan.' }

  // Guard label lama: dua pengubah bersamaan tidak saling menimpa diam-diam.
  const { data: updated, error } = await admin
    .from('master_references')
    .update({ label, description, ...(attrs ?? {}), updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('label', row.label)
    .select('id')
  if (error || !updated?.length) {
    if (error) console.error('updateReference failed:', error.message)
    return { error: 'Gagal menyimpan; muat ulang halaman lalu coba lagi.' }
  }
  await logActivity({
    actorUserId: actor.id,
    action: 'REFERENCE_UPDATED',
    entityType: 'master_reference',
    entityId: id,
    metadata: { list: row.list, code: row.code, from: row.label, label, description_changed: description !== row.description, ...(changes ? { changes } : {}) },
  })
  revalidatePath('/master-reference')
  return { success: 'Pilihan diperbarui.' }
}

/** Arsipkan / aktifkan lagi (mode = archive|restore). Tidak ada hapus. */
export async function setReferenceArchived(_prev: ReferenceFormState, formData: FormData): Promise<ReferenceFormState> {
  const actor = await requirePermission('reference.manage')
  const id = readLimitedField(formData, 'id')
  const archive = readLimitedField(formData, 'mode') === 'archive'
  const { data, error } = await createAdminClient()
    .from('master_references')
    .update({ archived_at: archive ? new Date().toISOString() : null, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('id, list, code, label')
    .maybeSingle<{ id: string; list: ReferenceList; code: string; label: string }>()
  if (error || !data) return { error: 'Pilihan tidak ditemukan.' }
  await logActivity({
    actorUserId: actor.id,
    action: archive ? 'REFERENCE_ARCHIVED' : 'REFERENCE_RESTORED',
    entityType: 'master_reference',
    entityId: id,
    metadata: { list: data.list, code: data.code, label: data.label },
  })
  revalidatePath('/master-reference')
  return { success: archive ? `"${data.label}" diarsipkan.` : `"${data.label}" aktif lagi.` }
}

/**
 * Kukuhkan teks bebas: jadikan pilihan baru (target kosong) atau gabung ke
 * pilihan yang ada. Entri tracker dengan teks itu ditautkan ke pilihan;
 * teks aslinya tidak diubah (keputusan pemilik 16 Nov 2026).
 */
export async function promoteFreeText(_prev: ReferenceFormState, formData: FormData): Promise<ReferenceFormState> {
  const actor = await requirePermission('reference.manage')
  const list = readLimitedField(formData, 'list')
  if (!isReferenceList(list) || !LOG_COLUMNS[list]) return { error: 'Daftar tidak dikenal.' }
  const cols = LOG_COLUMNS[list]!
  const text = normalizeText(readLimitedField(formData, 'text'))
  const targetId = readLimitedField(formData, 'target_id')
  if (!text) return { error: 'Teks kosong.' }

  let target: ReferenceRow | undefined
  if (targetId) {
    target = (await loadReferences([list])).find((r) => r.id === targetId && !r.archived_at)
    if (!target) return { error: 'Pilihan tujuan tidak ditemukan atau sudah diarsipkan.' }
  } else {
    const err = labelError(text)
    if (err) return { error: err }
    const res = await insertReference(list, text, null, actor.id)
    if ('error' in res) return { error: `${res.error} Pilih "Gabung ke" pilihan itu.` }
    target = res.row
  }

  // Cocokkan di sini dengan sameText (sama dengan pengelompokan usulan), bukan
  // ilike: '*' dan '%' di teks staf akan jadi wildcard (review 16 Nov 2026).
  const admin = createAdminClient()
  let ids: string[]
  try {
    const rows = await allRows<Record<string, string>>((from, to) => {
      let q = admin.from('work_logs').select(`id, ${cols.text}`).is(cols.ref, null).order('id').range(from, to)
      if (list === 'INTERNAL_PROJECT') q = q.is('project_id', null)
      return q
    })
    ids = rows.filter((r) => sameText(r[cols.text] ?? '', text)).map((r) => r.id)
  } catch {
    return { error: 'Gagal membaca entri. Silakan coba lagi.' }
  }
  let linked = 0
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await admin.from('work_logs').update({ [cols.ref]: target.id }).in('id', ids.slice(i, i + 200)).is(cols.ref, null).select('id')
    if (error) {
      console.error('promoteFreeText failed:', error.message)
      return { error: `Pilihan tersimpan, tetapi baru ${linked} entri tertaut. Silakan kukuhkan lagi.` }
    }
    linked += data?.length ?? 0
  }
  await logActivity({
    actorUserId: actor.id,
    action: 'REFERENCE_PROMOTED',
    entityType: 'master_reference',
    entityId: target.id,
    metadata: { list, code: target.code, label: target.label, text, entries: linked, merged: Boolean(targetId) },
  })
  revalidatePath('/master-reference')
  return { success: `"${text}" dikukuhkan sebagai "${target.label}" (${linked} entri).` }
}
