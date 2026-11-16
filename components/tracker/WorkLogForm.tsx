'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useFormAction } from '@/lib/forms/use-form-action'
import { saveWorkLog, deleteWorkLog, type TrackerFormState } from '@/app/actions/tracker'

const INITIAL: TrackerFormState = undefined
const INPUT = 'w-full rounded-lg border px-3 py-2 text-base outline-none focus:border-black dark:border-zinc-700 dark:bg-zinc-800'
const LABEL = 'mb-1 block text-sm font-medium'

export type WorkLogValues = {
  id: string
  /** Label tampilan (label master terkini bila tertaut, atau teks bebas). */
  project: string
  activity: string
  detail: string | null
  start_time: string
  end_time: string
  location: string
  category: string
  output: string | null
}

export function WorkLogForm({
  date,
  projects,
  categories,
  locations,
  suggestedStart,
  editing,
}: {
  date: string
  projects: string[]
  categories: string[]
  locations: string[]
  suggestedStart: string | null
  editing: WorkLogValues | null
}) {
  const [state, formProps, pending] = useFormAction(saveWorkLog, INITIAL)
  const router = useRouter()

  // Selesai mengubah: kembali ke mode isi baru.
  useEffect(() => {
    if (editing && state?.success) router.replace(`/tracker?tanggal=${date}`)
  }, [editing, state, date, router])

  return (
    <form {...formProps} className="grid gap-3 sm:grid-cols-2">
      {editing && <input type="hidden" name="id" value={editing.id} />}
      <div>
        <label htmlFor="work_date" className={LABEL}>Tanggal</label>
        <input id="work_date" name="work_date" type="date" required defaultValue={date} className={INPUT} />
      </div>
      <ChoiceInput id="project" label="Proyek" options={projects} maxLength={150} defaultValue={editing?.project} />
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="start_time" className={LABEL}>Jam mulai</label>
          <input id="start_time" name="start_time" type="time" required defaultValue={editing?.start_time.slice(0, 5) ?? suggestedStart ?? ''} className={INPUT} />
        </div>
        <div>
          <label htmlFor="end_time" className={LABEL}>Jam selesai</label>
          <input id="end_time" name="end_time" type="time" required defaultValue={editing?.end_time.slice(0, 5) ?? ''} className={INPUT} />
        </div>
      </div>
      <ChoiceInput id="category" label="Kategori" options={categories} maxLength={60} defaultValue={editing?.category} />
      <ChoiceInput id="location" label="Lokasi" options={locations} maxLength={60} defaultValue={editing?.location} />
      <div className="sm:col-span-2">
        <label htmlFor="activity" className={LABEL}>Aktivitas</label>
        <input id="activity" name="activity" required maxLength={300} defaultValue={editing?.activity ?? ''} className={INPUT} />
      </div>
      <div className="sm:col-span-2">
        <label htmlFor="detail" className={LABEL}>Detail pekerjaan (opsional)</label>
        <textarea id="detail" name="detail" rows={2} maxLength={5000} defaultValue={editing?.detail ?? ''} className={INPUT} />
      </div>
      <div className="sm:col-span-2">
        <label htmlFor="output" className={LABEL}>Output / hasil</label>
        <textarea id="output" name="output" rows={2} maxLength={2000} defaultValue={editing?.output ?? ''} className={INPUT} />
        <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">Output kosong akan dihitung sebagai pelanggaran disiplin mulai tahap berikutnya.</p>
      </div>

      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <button
          type="submit"
          disabled={pending}
          className="min-h-[44px] rounded-lg bg-kasuat-gold px-4 py-2 font-semibold text-kasuat-black disabled:opacity-50"
        >
          {pending ? 'Menyimpan...' : editing ? 'Simpan perubahan' : 'Catat aktivitas'}
        </button>
        {editing && (
          <a href={`/tracker?tanggal=${date}`} className="text-sm font-semibold text-kasuat-deep-gold hover:underline">
            Batal ubah
          </a>
        )}
        {state?.error && <p role="alert" className="text-sm font-medium text-red-600">{state.error}</p>}
        {state?.success && <p role="status" className="text-sm font-medium text-green-600">{state.success}</p>}
      </div>
    </form>
  )
}

/**
 * Ketik atau pilih dari daftar (datalist). Ketikan di luar daftar tetap
 * diterima sebagai teks bebas dan menjadi usulan Master Reference.
 */
function ChoiceInput({
  id,
  label,
  options,
  maxLength,
  defaultValue,
}: {
  id: string
  label: string
  options: string[]
  maxLength: number
  defaultValue?: string
}) {
  return (
    <div>
      <label htmlFor={id} className={LABEL}>{label}</label>
      <input
        id={id}
        name={id}
        required
        list={`${id}-pilihan`}
        maxLength={maxLength}
        autoComplete="off"
        defaultValue={defaultValue ?? ''}
        aria-describedby={`${id}-hint`}
        className={INPUT}
      />
      <datalist id={`${id}-pilihan`}>
        {options.map((o) => <option key={o} value={o} />)}
      </datalist>
      <p id={`${id}-hint`} className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">Pilih dari daftar, atau ketik bila tidak ada.</p>
    </div>
  )
}

export function DeleteWorkLogButton({ id }: { id: string }) {
  const [state, formProps, pending] = useFormAction(deleteWorkLog, INITIAL, () => 'Hapus aktivitas ini?')
  return (
    <form {...formProps} className="inline">
      <input type="hidden" name="id" value={id} />
      <button type="submit" disabled={pending} className="min-h-[44px] px-2 text-sm font-semibold text-red-700 hover:underline disabled:opacity-50">
        Hapus
      </button>
      {state?.error && <span role="alert" className="text-sm text-red-600">{state.error}</span>}
    </form>
  )
}
