'use client'

import { useFormAction } from '@/lib/forms/use-form-action'
import {
  addReference, promoteFreeText, setReferenceArchived, updateReference, type ReferenceFormState,
} from '@/app/actions/master-reference'

const INITIAL: ReferenceFormState = undefined
const INPUT = 'w-full rounded-lg border px-3 py-2 text-base outline-none focus:border-black dark:border-zinc-700 dark:bg-zinc-800'
const BTN = 'min-h-[44px] rounded-lg bg-kasuat-gold px-4 py-2 font-semibold text-kasuat-black disabled:opacity-50'
const LINK_BTN = 'min-h-[44px] px-2 text-sm font-semibold hover:underline disabled:opacity-50'

function Status({ state }: { state: ReferenceFormState }) {
  if (state?.error) return <p role="alert" className="text-sm font-medium text-red-600">{state.error}</p>
  if (state?.success) return <p role="status" className="text-sm font-medium text-green-600">{state.success}</p>
  return null
}

/** Aturan hitung satu jenis cuti (daftar LEAVE_TYPE). `idp` = awalan id supaya unik per form. */
function LeaveAttrFields({ idp, attrs }: { idp: string; attrs?: { counts_hours: boolean; uses_quota: boolean; max_days: number | null } }) {
  return (
    <fieldset className="grid gap-2 rounded-lg border p-3 dark:border-zinc-700 sm:col-span-3">
      <legend className="px-1 text-sm font-semibold">Aturan hitung</legend>
      <label className="flex min-h-[44px] items-center gap-2 text-sm">
        <input type="checkbox" name="counts_hours" defaultChecked={attrs?.counts_hours ?? false} className="h-5 w-5" />
        Dihitung jam kerja (hari disetujui = jam per hari ditambahkan ke jam kerja)
      </label>
      <label className="flex min-h-[44px] items-center gap-2 text-sm">
        <input type="checkbox" name="uses_quota" defaultChecked={attrs?.uses_quota ?? false} className="h-5 w-5" />
        Memotong jatah cuti tahunan
      </label>
      <div>
        <label htmlFor={`${idp}-max`} className="mb-1 block text-sm font-medium">Batas hari kerja per pengajuan (kosong = tanpa batas khusus)</label>
        <input id={`${idp}-max`} name="max_days" inputMode="numeric" maxLength={3} defaultValue={attrs?.max_days ?? ''} className={`${INPUT} sm:w-40`} />
      </div>
    </fieldset>
  )
}

export function AddReferenceForm({ list }: { list: string }) {
  const [state, formProps, pending] = useFormAction(addReference, INITIAL)
  return (
    <form {...formProps} className="grid gap-2 sm:grid-cols-[1fr_2fr_auto] sm:items-end">
      <input type="hidden" name="list" value={list} />
      <div>
        <label htmlFor={`add-label-${list}`} className="mb-1 block text-sm font-medium">Pilihan baru</label>
        <input id={`add-label-${list}`} name="label" required maxLength={80} className={INPUT} />
      </div>
      <div>
        <label htmlFor={`add-desc-${list}`} className="mb-1 block text-sm font-medium">Penjelasan (opsional)</label>
        <input id={`add-desc-${list}`} name="description" maxLength={500} className={INPUT} />
      </div>
      {list === 'LEAVE_TYPE' && <LeaveAttrFields idp={`add-${list}`} />}
      <button type="submit" disabled={pending} className={BTN}>{pending ? 'Menyimpan...' : 'Tambah'}</button>
      <div className="sm:col-span-3"><Status state={state} /></div>
    </form>
  )
}

export function EditReferenceForm({ id, label, description, attrs }: { id: string; label: string; description: string | null; attrs?: { counts_hours: boolean; uses_quota: boolean; max_days: number | null } }) {
  const [state, formProps, pending] = useFormAction(updateReference, INITIAL)
  return (
    <details className="mt-1">
      <summary className="cursor-pointer text-sm font-semibold text-kasuat-deep-gold">Ubah</summary>
      <form {...formProps} className="mt-2 grid gap-2">
        <input type="hidden" name="id" value={id} />
        <label className="text-sm font-medium" htmlFor={`edit-label-${id}`}>Label (hanya boleh ditambah)</label>
        <input id={`edit-label-${id}`} name="label" required maxLength={80} defaultValue={label} className={INPUT} />
        <label className="text-sm font-medium" htmlFor={`edit-desc-${id}`}>Penjelasan</label>
        <textarea id={`edit-desc-${id}`} name="description" rows={2} maxLength={500} defaultValue={description ?? ''} className={INPUT} />
        {attrs && <LeaveAttrFields idp={`edit-${id}`} attrs={attrs} />}
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={pending} className={BTN}>{pending ? 'Menyimpan...' : 'Simpan'}</button>
          <Status state={state} />
        </div>
      </form>
    </details>
  )
}

export function ArchiveReferenceButton({ id, label, archived }: { id: string; label: string; archived: boolean }) {
  const [state, formProps, pending] = useFormAction(setReferenceArchived, INITIAL, () =>
    archived ? null : `Arsipkan "${label}"? Data lama tetap memakai pilihan ini, tetapi tidak bisa dipilih untuk isian baru.`
  )
  return (
    <form {...formProps} className="inline">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="mode" value={archived ? 'restore' : 'archive'} />
      <button type="submit" disabled={pending} className={`${LINK_BTN} ${archived ? 'text-kasuat-deep-gold' : 'text-red-700'}`}>
        {archived ? 'Aktifkan lagi' : 'Arsipkan'}
      </button>
      <Status state={state} />
    </form>
  )
}

export function PromoteForm({ list, text, targets }: { list: string; text: string; targets: { id: string; label: string }[] }) {
  const [state, formProps, pending] = useFormAction(promoteFreeText, INITIAL)
  const selectId = `promote-${list}-${text}`
  return (
    <form {...formProps} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="list" value={list} />
      <input type="hidden" name="text" value={text} />
      <div>
        <label htmlFor={selectId} className="mb-1 block text-xs font-medium">Kukuhkan sebagai</label>
        <select id={selectId} name="target_id" defaultValue="" className="rounded-lg border px-2 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800">
          <option value="">Pilihan baru &quot;{text}&quot;</option>
          {targets.map((t) => <option key={t.id} value={t.id}>Gabung ke &quot;{t.label}&quot;</option>)}
        </select>
      </div>
      <button type="submit" disabled={pending} className={BTN}>{pending ? 'Menyimpan...' : 'Kukuhkan'}</button>
      <Status state={state} />
    </form>
  )
}
