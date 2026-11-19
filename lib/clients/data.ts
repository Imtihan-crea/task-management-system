import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { isStage, type LeadStage } from '@/lib/clients/pipeline'

export type Lead = {
  id: string
  company_name: string
  contact_name: string | null
  contact_email: string | null
  contact_phone: string | null
  source: string | null
  estimated_value: number
  stage: LeadStage
  owner_id: string | null
  notes: string | null
  lost_reason: string | null
  created_at: string
  updated_at: string
}

export type LeadEvent = { id: string; author_id: string | null; body: string; from_stage: LeadStage | null; to_stage: LeadStage | null; created_at: string }

export type LeadFilter = { stage?: string; pic?: string; q?: string }

const COLUMNS = 'id, company_name, contact_name, contact_email, contact_phone, source, estimated_value, stage, owner_id, notes, lost_reason, created_at, updated_at'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const sanitizeLeadSearch = (v: string | undefined) => (v ?? '').replace(/[,()*%\\]/g, ' ').trim().slice(0, 60)

/** Daftar lead (cakupan sama untuk halaman dan export); pemanggil sudah mengecek izin clients.view. */
export async function loadLeads(f: LeadFilter): Promise<Lead[]> {
  let query = createAdminClient().from('client_leads').select(COLUMNS).order('updated_at', { ascending: false }).limit(2000)
  if (f.stage && isStage(f.stage)) query = query.eq('stage', f.stage)
  if (f.pic === 'none') query = query.is('owner_id', null)
  else if (f.pic && UUID.test(f.pic)) query = query.eq('owner_id', f.pic)
  const q = sanitizeLeadSearch(f.q)
  if (q) query = query.ilike('company_name', `%${q}%`)
  const { data, error } = await query
  if (error) console.error('loadLeads failed:', error.message)
  return ((data ?? []) as Lead[]).map((l) => ({ ...l, estimated_value: Number(l.estimated_value) }))
}

export async function loadLead(id: string): Promise<Lead | null> {
  if (!UUID.test(id)) return null
  const { data } = await createAdminClient().from('client_leads').select(COLUMNS).eq('id', id).maybeSingle<Lead>()
  return data ? { ...data, estimated_value: Number(data.estimated_value) } : null
}

export async function loadLeadEvents(leadId: string): Promise<LeadEvent[]> {
  const { data } = await createAdminClient()
    .from('client_lead_events')
    .select('id, author_id, body, from_stage, to_stage, created_at')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false })
    .limit(500)
  return (data ?? []) as LeadEvent[]
}

/** Nama tampilan profil (PIC, penulis catatan). */
export async function loadNames(ids: (string | null)[]): Promise<Record<string, string>> {
  const uniq = [...new Set(ids.filter((x): x is string => !!x))]
  if (uniq.length === 0) return {}
  const { data } = await createAdminClient().from('profiles').select('id, full_name, email').in('id', uniq)
  return Object.fromEntries(((data ?? []) as { id: string; full_name: string | null; email: string }[]).map((p) => [p.id, p.full_name || p.email]))
}
