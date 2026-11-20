'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Combobox } from '@/components/ui/Combobox'
import { useFormAction } from '@/lib/forms/use-form-action'
import { saveWorkLog, deleteWorkLog, type TrackerFormState } from '@/app/actions/tracker'
import { durationMinutes, isoWeek } from '@/lib/hr/tracker'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

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
  name,
  division,
  projects,
  categories,
  locations,
  suggestedStart,
  editing,
}: {
  date: string
  /** Nama dan divisi dari profil (divisi diatur HR di data karyawan). */
  name: string
  division: string | null
  projects: string[]
  categories: string[]
  locations: string[]
  suggestedStart: string | null
  editing: WorkLogValues | null
}) {
  const [state, formProps, pending] = useFormAction(saveWorkLog, INITIAL)
  const router = useRouter()
  const startDefault = editing?.start_time.slice(0, 5) ?? suggestedStart ?? ''
  const endDefault = editing?.end_time.slice(0, 5) ?? ''
  // Minggu ke- dan durasi dihitung ulang saat tanggal/jam diubah, seperti rumus di sheet.
  const [live, setLive] = useState({ date, start: startDefault, end: endDefault })
  const readLive = (f: HTMLFormElement) => {
    const v = (n: string) => (f.elements.namedItem(n) as HTMLInputElement | null)?.value ?? ''
    setLive({ date: v('work_date'), start: v('start_time'), end: v('end_time') })
  }
  const minutes = durationMinutes(live.start, live.end)

  // Selesai mengubah: kembali ke mode isi baru.
  useEffect(() => {
    if (editing && state?.success) router.replace(`/tracker?tanggal=${date}`)
  }, [editing, state, date, router])

  return (
    <form
      {...formProps}
      onInput={(e) => readLive(e.currentTarget)}
      onReset={(e) => { const f = e.currentTarget; setTimeout(() => readLive(f), 0) }}
      className="grid gap-3 sm:grid-cols-2"
    >
      {editing && <input type="hidden" name="id" value={editing.id} />}
      {/* Urutan dan nama isian mengikuti sheet Daily Tracker (keputusan pemilik 20 Nov 2026). */}
      <div className="grid grid-cols-2 gap-3 sm:col-span-2 lg:grid-cols-4">
        <div>
          <label htmlFor="work_date" className={LABEL}>Tanggal</label>
          <input id="work_date" name="work_date" type="date" required defaultValue={date} className={INPUT} />
        </div>
        <AutoField label="Minggu Ke-" value={DATE_RE.test(live.date) ? String(isoWeek(live.date)) : '-'} />
        <AutoField label="Nama" value={name} />
        <AutoField label="Divisi" value={division ?? 'Belum diisi HR'} />
      </div>
      <ChoiceInput id="project" label="Proyek" options={projects} maxLength={150} defaultValue={editing?.project} />
      <div className="sm:col-span-2">
        <label htmlFor="activity" className={LABEL}>Aktivitas</label>
        <input id="activity" name="activity" required maxLength={300} defaultValue={editing?.activity ?? ''} className={INPUT} />
      </div>
      <div className="sm:col-span-2">
        <label htmlFor="detail" className={LABEL}>Detail Pekerjaan</label>
        <textarea id="detail" name="detail" required rows={2} maxLength={5000} defaultValue={editing?.detail ?? ''} className={INPUT} />
      </div>
      <div className="grid grid-cols-3 gap-3 sm:col-span-2">
        <div>
          <label htmlFor="start_time" className={LABEL}>Jam Mulai</label>
          <input id="start_time" name="start_time" type="time" required defaultValue={startDefault} className={INPUT} />
        </div>
        <div>
          <label htmlFor="end_time" className={LABEL}>Jam Selesai</label>
          <input id="end_time" name="end_time" type="time" required defaultValue={endDefault} className={INPUT} />
        </div>
        <AutoField label="Durasi (Jam)" value={minutes === null ? '-' : (minutes / 60).toLocaleString('id-ID', { maximumFractionDigits: 2 })} />
      </div>
      <ChoiceInput id="location" label="Lokasi" options={locations} maxLength={60} defaultValue={editing?.location} />
      <ChoiceInput id="category" label="Kategori Aktivitas" options={categories} maxLength={60} defaultValue={editing?.category} />
      <div className="sm:col-span-2">
        <label htmlFor="output" className={LABEL}>Output/Deliverables</label>
        <textarea id="output" name="output" required rows={2} maxLength={2000} defaultValue={editing?.output ?? ''} className={INPUT} />
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

/** Terisi otomatis (tidak dikirim): seperti kolom rumus di sheet. */
function AutoField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className={LABEL}>{label}</span>
      <p className="rounded-lg border border-dashed px-3 py-2 text-base text-zinc-700 dark:border-zinc-700 dark:text-zinc-300">{value}</p>
      <span className="mt-1 block text-xs text-zinc-600 dark:text-zinc-400">Otomatis</span>
    </div>
  )
}

/**
 * Ketik atau pilih dari daftar (Combobox). Ketikan di luar daftar tetap
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
      <Combobox id={id} name={id} required options={options} maxLength={maxLength} defaultValue={defaultValue} describedBy={`${id}-hint`} />
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
