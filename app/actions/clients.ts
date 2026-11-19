'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requirePermission } from '@/lib/auth/current-access'
import { createAdminClient } from '@/lib/supabase/admin'
import { logActivity } from '@/lib/activity-log/service'
import { readLimitedField } from '@/lib/forms/limits'
import { loadLead } from '@/lib/clients/data'
import { readInput, toForm } from '@/lib/bulk'
import { bulk } from '@/lib/bulk-server'
import { STAGE_LABEL, isStage, leadError, parseValue, stageChangeError, type LeadInput } from '@/lib/clients/pipeline'

export type ClientFormState = { error?: string; success?: string } | undefined

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function done(id?: string) {
  revalidatePath('/clients')
  if (id) revalidatePath(`/clients/${id}`)
}

/** Baca isian lead dari form; string = pesan error. */
async function readLead(formData: FormData): Promise<{ input: LeadInput; ownerId: string | null } | string> {
  const value = parseValue(readLimitedField(formData, 'estimated_value'))
  if (typeof value === 'string') return value
  const input: LeadInput = {
    company_name: readLimitedField(formData, 'company_name').trim(),
    contact_name: readLimitedField(formData, 'contact_name').trim() || null,
    contact_email: readLimitedField(formData, 'contact_email').trim() || null,
    contact_phone: readLimitedField(formData, 'contact_phone').trim() || null,
    source: readLimitedField(formData, 'source').trim() || null,
    estimated_value: value,
    notes: readLimitedField(formData, 'description').trim() || null,
  }
  const err = leadError(input)
  if (err) return err
  const owner = readLimitedField(formData, 'owner_id')
  let ownerId: string | null = null
  if (owner) {
    if (!UUID.test(owner)) return 'PIC tidak valid.'
    const { data } = await createAdminClient().from('profiles').select('id').eq('id', owner).eq('status', 'ACTIVE').is('deleted_at', null).maybeSingle()
    if (!data) return 'PIC harus berupa user yang aktif.'
    ownerId = owner
  }
  return { input, ownerId }
}

export async function createLead(_prev: ClientFormState, formData: FormData): Promise<ClientFormState> {
  const actor = await requirePermission('clients.manage')
  const read = await readLead(formData)
  if (typeof read === 'string') return { error: read }
  const { input, ownerId } = read

  const { data, error } = await createAdminClient()
    .from('client_leads')
    .insert({ ...input, owner_id: ownerId, created_by: actor.id })
    .select('id')
    .single<{ id: string }>()
  if (error || !data) {
    console.error('createLead failed:', error?.message)
    return { error: 'Gagal menyimpan lead. Silakan coba lagi.' }
  }
  await logActivity({ actorUserId: actor.id, action: 'CLIENT_LEAD_CREATED', entityType: 'client_lead', entityId: data.id, metadata: { company_name: input.company_name } })
  done()
  redirect(`/clients/${data.id}`)
}

export async function updateLead(_prev: ClientFormState, formData: FormData): Promise<ClientFormState> {
  const actor = await requirePermission('clients.manage')
  const id = readLimitedField(formData, 'id')
  const lead = await loadLead(id)
  if (!lead) return { error: 'Lead tidak ditemukan.' }
  const read = await readLead(formData)
  if (typeof read === 'string') return { error: read }
  const { input, ownerId } = read

  const { error } = await createAdminClient()
    .from('client_leads')
    .update({ ...input, owner_id: ownerId, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) {
    console.error('updateLead failed:', error.message)
    return { error: 'Gagal menyimpan perubahan. Silakan coba lagi.' }
  }
  await logActivity({ actorUserId: actor.id, action: 'CLIENT_LEAD_UPDATED', entityType: 'client_lead', entityId: id, metadata: { company_name: input.company_name } })
  done(id)
  return { success: 'Perubahan disimpan.' }
}

export async function changeLeadStage(_prev: ClientFormState, formData: FormData): Promise<ClientFormState> {
  const actor = await requirePermission('clients.manage')
  const id = readLimitedField(formData, 'id')
  const to = readLimitedField(formData, 'stage')
  const reason = readLimitedField(formData, 'lost_reason').trim() || null
  if (!isStage(to)) return { error: 'Pilih tahap yang valid.' }
  const lead = await loadLead(id)
  if (!lead) return { error: 'Lead tidak ditemukan.' }
  const err = stageChangeError(lead.stage, to, reason)
  if (err) return { error: err }

  const admin = createAdminClient()
  // .eq('stage', lead.stage): bila sudah dipindah orang lain, tidak menimpa diam-diam.
  const { data: updated, error } = await admin
    .from('client_leads')
    .update({ stage: to, lost_reason: to === 'BATAL' ? reason : null, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('stage', lead.stage)
    .select('id')
  if (error || !updated?.length) return { error: 'Gagal memindahkan tahap; muat ulang halaman lalu coba lagi.' }

  const note = readLimitedField(formData, 'note').trim()
  const { error: evErr } = await admin.from('client_lead_events').insert({
    lead_id: id,
    author_id: actor.id,
    body: to === 'BATAL' ? `Alasan batal: ${reason}${note ? `\n${note}` : ''}` : note,
    from_stage: lead.stage,
    to_stage: to,
  })
  if (evErr) console.error('changeLeadStage event failed:', evErr.message)
  await logActivity({
    actorUserId: actor.id,
    action: 'CLIENT_LEAD_STAGE_CHANGED',
    entityType: 'client_lead',
    entityId: id,
    metadata: { company_name: lead.company_name, from: lead.stage, to, from_label: STAGE_LABEL[lead.stage], to_label: STAGE_LABEL[to] },
  })
  done(id)
  return { success: `Dipindah ke ${STAGE_LABEL[to]}.` }
}

export async function addLeadNote(_prev: ClientFormState, formData: FormData): Promise<ClientFormState> {
  const actor = await requirePermission('clients.manage')
  const id = readLimitedField(formData, 'id')
  const body = readLimitedField(formData, 'note').trim()
  if (!body) return { error: 'Catatan tidak boleh kosong.' }
  const lead = await loadLead(id)
  if (!lead) return { error: 'Lead tidak ditemukan.' }
  const admin = createAdminClient()
  const { error } = await admin.from('client_lead_events').insert({ lead_id: id, author_id: actor.id, body })
  if (error) {
    console.error('addLeadNote failed:', error.message)
    return { error: 'Gagal menyimpan catatan. Silakan coba lagi.' }
  }
  await admin.from('client_leads').update({ updated_at: new Date().toISOString() }).eq('id', id)
  // Isi catatan tidak ikut ke activity log (bisa memuat data pribadi).
  await logActivity({ actorUserId: actor.id, action: 'CLIENT_LEAD_NOTE_ADDED', entityType: 'client_lead', entityId: id, metadata: { company_name: lead.company_name } })
  done(id)
  return { success: 'Catatan ditambahkan.' }
}

/* Aksi massal (19 Nov 2026): tiap lead lewat aksi satuan (izin clients.manage, aturan tahap, riwayat, log sama). */
export async function bulkChangeLeadStage(ids: unknown, input: unknown) {
  const stage = readInput(input, 'stage')
  const reason = readInput(input, 'lost_reason')
  return bulk(ids, (id) => changeLeadStage(undefined, toForm({ id, stage, lost_reason: reason })), 'dipindah')
}

/** Ganti PIC lewat updateLead: isian lain = nilai lead saat ini. Kosong = lepas PIC. */
export async function bulkSetLeadOwner(ids: unknown, input: unknown) {
  const owner = readInput(input, 'owner_id')
  return bulk(
    ids,
    async (id) => {
      const lead = await loadLead(id)
      if (!lead) return { error: 'Lead tidak ditemukan.' }
      return updateLead(
        undefined,
        toForm({
          id,
          company_name: lead.company_name,
          contact_name: lead.contact_name,
          contact_email: lead.contact_email,
          contact_phone: lead.contact_phone,
          source: lead.source,
          estimated_value: String(lead.estimated_value),
          description: lead.notes,
          owner_id: owner === 'none' ? '' : owner,
        })
      )
    },
    'diperbarui'
  )
}
