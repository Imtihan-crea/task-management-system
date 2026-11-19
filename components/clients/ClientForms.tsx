'use client'

import { useState } from 'react'
import { useFormAction } from '@/lib/forms/use-form-action'
import { addLeadNote, changeLeadStage, createLead, updateLead, type ClientFormState } from '@/app/actions/clients'
import { STAGE_LABEL, type LeadStage } from '@/lib/clients/pipeline'
import type { Lead } from '@/lib/clients/data'

const INITIAL: ClientFormState = undefined
const INPUT = 'min-h-[44px] w-full rounded-lg border px-3 py-2 text-base dark:border-zinc-700 dark:bg-zinc-800'
const LABEL = 'mb-1 block text-sm font-medium'
const BTN = 'min-h-[44px] rounded-lg bg-kasuat-gold px-4 py-2 font-semibold text-kasuat-black disabled:opacity-50'

export type PicOption = { id: string; name: string }

function Status({ state }: { state: ClientFormState }) {
  if (state?.error) return <p role="alert" className="text-sm font-medium text-red-600">{state.error}</p>
  if (state?.success) return <p role="status" className="text-sm font-medium text-green-600">{state.success}</p>
  return null
}

/** Tambah (tanpa lead) atau ubah (dengan lead) data lead. */
export function LeadForm({ lead, pics }: { lead?: Lead; pics: PicOption[] }) {
  const [state, formProps, pending] = useFormAction(lead ? updateLead : createLead, INITIAL)
  return (
    <form {...formProps} className="grid gap-4 sm:grid-cols-2">
      {lead && <input type="hidden" name="id" value={lead.id} />}
      <div className="sm:col-span-2">
        <label htmlFor="lead_company" className={LABEL}>Nama perusahaan <span aria-hidden="true">*</span></label>
        <input id="lead_company" name="company_name" required maxLength={150} defaultValue={lead?.company_name ?? ''} className={INPUT} />
      </div>
      <div>
        <label htmlFor="lead_contact" className={LABEL}>Nama kontak</label>
        <input id="lead_contact" name="contact_name" maxLength={120} defaultValue={lead?.contact_name ?? ''} className={INPUT} />
      </div>
      <div>
        <label htmlFor="lead_email" className={LABEL}>Email kontak</label>
        <input id="lead_email" name="contact_email" type="email" maxLength={254} defaultValue={lead?.contact_email ?? ''} className={INPUT} />
      </div>
      <div>
        <label htmlFor="lead_phone" className={LABEL}>Telepon kontak</label>
        <input id="lead_phone" name="contact_phone" type="tel" maxLength={30} defaultValue={lead?.contact_phone ?? ''} className={INPUT} />
      </div>
      <div>
        <label htmlFor="lead_source" className={LABEL}>Sumber lead</label>
        <input id="lead_source" name="source" maxLength={100} placeholder="mis. referral, pameran, website" defaultValue={lead?.source ?? ''} className={INPUT} />
      </div>
      <div>
        <label htmlFor="lead_value" className={LABEL}>Perkiraan nilai (Rupiah)</label>
        <input id="lead_value" name="estimated_value" type="number" inputMode="decimal" min={0} step="any" defaultValue={lead ? lead.estimated_value : ''} className={INPUT} />
      </div>
      <div>
        <label htmlFor="lead_owner" className={LABEL}>PIC</label>
        <select id="lead_owner" name="owner_id" defaultValue={lead?.owner_id ?? ''} className={INPUT}>
          <option value="">Belum ada PIC</option>
          {pics.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>
      <div className="sm:col-span-2">
        <label htmlFor="lead_notes" className={LABEL}>Catatan</label>
        <textarea id="lead_notes" name="description" rows={3} maxLength={5000} defaultValue={lead?.notes ?? ''} className={INPUT} />
      </div>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <button type="submit" disabled={pending} className={BTN}>{pending ? 'Menyimpan...' : lead ? 'Simpan Perubahan' : 'Tambah Lead'}</button>
        <Status state={state} />
      </div>
    </form>
  )
}

/** Pindah tahap; kolom alasan muncul dan wajib bila tujuan = Batal. */
export function StageForm({ id, targets }: { id: string; targets: LeadStage[] }) {
  const [state, formProps, pending] = useFormAction(changeLeadStage, INITIAL)
  const [to, setTo] = useState<string>('')
  if (targets.length === 0) return <p className="text-sm text-zinc-600 dark:text-zinc-400">Lead yang sudah Deal tidak dipindah lagi.</p>
  return (
    <form {...formProps} className="grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="id" value={id} />
      <div>
        <label htmlFor="stage_to" className={LABEL}>Pindah ke tahap</label>
        <select id="stage_to" name="stage" required value={to} onChange={(e) => setTo(e.target.value)} className={INPUT}>
          <option value="" disabled>Pilih tahap</option>
          {targets.map((s) => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor="stage_note" className={LABEL}>Catatan (opsional)</label>
        <input id="stage_note" name="note" maxLength={2000} className={INPUT} />
      </div>
      {to === 'BATAL' && (
        <div className="sm:col-span-2">
          <label htmlFor="stage_reason" className={LABEL}>Alasan batal <span aria-hidden="true">*</span></label>
          <input id="stage_reason" name="lost_reason" required maxLength={1000} className={INPUT} />
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <button type="submit" disabled={pending} className={BTN}>{pending ? 'Memindahkan...' : 'Pindahkan'}</button>
        <Status state={state} />
      </div>
    </form>
  )
}

export function NoteForm({ id }: { id: string }) {
  const [state, formProps, pending] = useFormAction(addLeadNote, INITIAL)
  return (
    <form {...formProps} className="flex flex-col gap-3">
      <input type="hidden" name="id" value={id} />
      <label htmlFor="lead_note" className={LABEL}>Tambah catatan</label>
      <textarea id="lead_note" name="note" required rows={2} maxLength={2000} className={INPUT} />
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className={BTN}>{pending ? 'Menyimpan...' : 'Simpan Catatan'}</button>
        <Status state={state} />
      </div>
    </form>
  )
}
