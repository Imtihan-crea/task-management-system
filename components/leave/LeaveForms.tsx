'use client'

import { useState } from 'react'
import { useFormAction } from '@/lib/forms/use-form-action'
import { cancelOwnLeave, decideLeave, submitLeave, type LeaveFormState } from '@/app/actions/leave'
import { SPECIAL_KIND, SPECIAL_REASONS, type LeaveType } from '@/lib/hr/leave'

const INITIAL: LeaveFormState = undefined
const INPUT = 'w-full rounded-lg border px-3 py-2 text-base outline-none focus:border-black dark:border-zinc-700 dark:bg-zinc-800'
const LABEL = 'mb-1 block text-sm font-medium'
const BTN = 'min-h-[44px] rounded-lg bg-kasuat-gold px-4 py-2 font-semibold text-kasuat-black disabled:opacity-50'

function Status({ state }: { state: LeaveFormState }) {
  if (state?.error) return <p role="alert" className="text-sm font-medium text-red-600">{state.error}</p>
  if (state?.success) return <p role="status" className="text-sm font-medium text-green-600">{state.success}</p>
  return null
}

export function LeaveRequestForm({ today, types }: { today: string; types: Pick<LeaveType, 'code' | 'label' | 'description' | 'max_days'>[] }) {
  const [state, formProps, pending] = useFormAction(submitLeave, INITIAL)
  const [kind, setKind] = useState('')
  const chosen = types.find((t) => t.code === kind)
  return (
    <form {...formProps} className="grid gap-3 sm:grid-cols-3">
      <div>
        <label htmlFor="leave_kind" className={LABEL}>Jenis</label>
        <select id="leave_kind" name="kind" required value={kind} onChange={(e) => setKind(e.target.value)} className={INPUT}>
          <option value="" disabled>Pilih</option>
          {types.map((t) => <option key={t.code} value={t.code}>{t.label}</option>)}
        </select>
      </div>
      {chosen && (chosen.description || chosen.max_days) && (
        <p className="text-sm text-zinc-600 dark:text-zinc-400 sm:col-span-2 sm:self-end">
          {chosen.description}{chosen.description && chosen.max_days ? ' ' : ''}{chosen.max_days ? `Maks ${chosen.max_days} hari kerja per pengajuan.` : ''}
        </p>
      )}
      {kind === SPECIAL_KIND && (
        <div className="sm:col-span-3">
          <label htmlFor="leave_special" className={LABEL}>Alasan {chosen?.label ?? 'Cuti Khusus'}</label>
          <select id="leave_special" name="special_reason" required defaultValue="" className={INPUT}>
            <option value="" disabled>Pilih</option>
            {SPECIAL_REASONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}{r.maxDays ? ` (maks ${r.maxDays} hari kerja)` : ''}
              </option>
            ))}
          </select>
        </div>
      )}
      <div>
        <label htmlFor="leave_start" className={LABEL}>Mulai</label>
        <input id="leave_start" name="start_date" type="date" required defaultValue={today} className={INPUT} />
      </div>
      <div>
        <label htmlFor="leave_end" className={LABEL}>Sampai (kosongkan bila 1 hari)</label>
        <input id="leave_end" name="end_date" type="date" className={INPUT} />
      </div>
      <div className="sm:col-span-2">
        <label htmlFor="leave_reason" className={LABEL}>Alasan / keterangan</label>
        <input id="leave_reason" name="reason" maxLength={1000} className={INPUT} />
      </div>
      <div>
        <label htmlFor="leave_attachment" className={LABEL}>Tautan lampiran (mis. surat dokter)</label>
        <input id="leave_attachment" name="attachment_url" type="url" maxLength={2000} placeholder="https://" className={INPUT} />
      </div>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-3">
        <button type="submit" disabled={pending} className={BTN}>{pending ? 'Mengirim...' : 'Ajukan'}</button>
        <Status state={state} />
      </div>
    </form>
  )
}

export function CancelOwnLeaveButton({ id }: { id: string }) {
  const [state, formProps, pending] = useFormAction(cancelOwnLeave, INITIAL, () => 'Batalkan pengajuan ini?')
  return (
    <form {...formProps} className="inline">
      <input type="hidden" name="id" value={id} />
      <button type="submit" disabled={pending} className="min-h-[44px] px-2 text-sm font-semibold text-red-700 hover:underline disabled:opacity-50">Batalkan</button>
      <Status state={state} />
    </form>
  )
}

/** Setujui / tolak (pengajuan menunggu) atau batalkan (yang sudah disetujui). */
export function DecideLeaveForm({ id, mode }: { id: string; mode: 'pending' | 'approved' }) {
  const [state, formProps, pending] = useFormAction(decideLeave, INITIAL, (fd) =>
    fd.get('decision') === 'cancel' ? 'Batalkan cuti yang sudah disetujui ini?' : null
  )
  return (
    <form {...formProps} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="id" value={id} />
      <label htmlFor={`note-${id}`} className="sr-only">Catatan</label>
      <input id={`note-${id}`} name="decision_note" maxLength={1000} placeholder="Catatan (opsional)" className="min-w-0 flex-1 rounded-lg border px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800" />
      {mode === 'pending' ? (
        <>
          <button type="submit" name="decision" value="approve" disabled={pending} className={BTN}>Setujui</button>
          <button type="submit" name="decision" value="reject" disabled={pending} className="min-h-[44px] rounded-lg border px-4 py-2 font-semibold text-red-700 disabled:opacity-50 dark:border-zinc-700">Tolak</button>
        </>
      ) : (
        <button type="submit" name="decision" value="cancel" disabled={pending} className="min-h-[44px] rounded-lg border px-4 py-2 text-sm font-semibold text-red-700 disabled:opacity-50 dark:border-zinc-700">Batalkan</button>
      )}
      <div className="w-full"><Status state={state} /></div>
    </form>
  )
}
