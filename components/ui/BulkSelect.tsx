'use client'

import { createContext, useContext, useEffect, useId, useMemo, useRef, useState, useTransition, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { ExportLink } from '@/components/export/ExportLink'
import type { BulkResult } from '@/lib/bulk'

/**
 * Pilih satu / sebagian / semua + bilah aksi massal (aturan pemilik, 19 Nov 2026).
 *
 * Pemakaian (halaman server):
 *   <BulkSelectProvider ids={idDiHalamanIni}>
 *     <BulkBar noun="task" actions={[...]} exportHref="/tasks/export?..." />
 *     ... baris dengan <BulkCheckbox id label /> ...
 *   </BulkSelectProvider>
 * Aksi = server action massal `(ids, input) => BulkResult`; izin dicek per item di server.
 */

type Ctx = {
  all: string[]
  selected: Set<string>
  toggle: (id: string) => void
  setAll: (on: boolean) => void
  clear: () => void
}

const BulkCtx = createContext<Ctx | null>(null)

function useBulk(): Ctx {
  const c = useContext(BulkCtx)
  if (!c) throw new Error('BulkCheckbox/BulkBar harus di dalam BulkSelectProvider.')
  return c
}

export function BulkSelectProvider({ ids, children }: { ids: string[]; children: ReactNode }) {
  const [raw, setRaw] = useState<Set<string>>(() => new Set())
  // Pilihan selalu dibatasi ke item yang sedang tampil (filter/halaman berubah = pilihan lama gugur).
  const selected = useMemo(() => {
    const allSet = new Set(ids)
    return new Set([...raw].filter((id) => allSet.has(id)))
  }, [raw, ids])

  const value: Ctx = {
    all: ids,
    selected,
    toggle: (id) =>
      setRaw((prev) => {
        const next = new Set(prev)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      }),
    setAll: (on) => setRaw(on ? new Set(ids) : new Set()),
    clear: () => setRaw(new Set()),
  }

  return (
    <BulkCtx.Provider value={value}>
      {/* Ruang untuk bilah aksi yang menempel di bawah layar HP, supaya baris terakhir tidak tertutup. */}
      <div className={selected.size > 0 ? 'pb-48 md:pb-0' : undefined}>{children}</div>
    </BulkCtx.Provider>
  )
}

/** Kotak centang per baris/kartu. Target sentuh 44px; `relative z-10` supaya tidak tertutup tautan baris. */
export function BulkCheckbox({ id, label, className = '' }: { id: string; label: string; className?: string }) {
  const c = useBulk()
  return (
    <label className={`relative z-10 inline-flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 ${className}`}>
      <input
        type="checkbox"
        className="h-5 w-5 cursor-pointer accent-kasuat-deep-gold"
        checked={c.selected.has(id)}
        onChange={() => c.toggle(id)}
        aria-label={`Pilih ${label}`}
      />
    </label>
  )
}

export type BulkActionDef = {
  key: string
  label: string
  run: (ids: string[], input: Record<string, string>) => Promise<BulkResult>
  /** Merusak / tidak bisa dibatalkan: tombol merah + konfirmasi menyebut jumlah. */
  danger?: boolean
  /** Minta konfirmasi walau bukan danger. */
  confirm?: boolean
  /** Pilihan nilai (mis. status baru). */
  select?: { name: string; label: string; options: { value: string; label: string }[] }
  /** Isian teks (mis. alasan). `when` = hanya tampil/wajib bila select bernilai itu. */
  text?: { name: string; label: string; required?: boolean; maxLength?: number; when?: string }
}

function needsPanel(a: BulkActionDef) {
  return Boolean(a.danger || a.confirm || a.select || a.text)
}

const BTN =
  'inline-flex min-h-[44px] items-center justify-center rounded-lg px-3 py-2 text-sm font-semibold disabled:opacity-50'
const BTN_SECONDARY = `${BTN} border border-zinc-300 bg-white text-kasuat-black hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800`
const BTN_DANGER = `${BTN} border border-red-300 bg-white text-red-700 hover:bg-red-50 dark:border-red-700 dark:bg-zinc-900 dark:text-red-300 dark:hover:bg-red-950`
const BTN_PRIMARY = `${BTN} bg-kasuat-gold text-kasuat-black hover:bg-kasuat-deep-gold`

/**
 * Baris "Pilih semua" di atas daftar + bilah aksi saat ada pilihan.
 * HP: bilah aksi menempel di bawah layar. Laptop: di atas daftar (tidak menutupi isi).
 */
export function BulkBar({
  noun,
  actions = [],
  exportHref,
  paged = false,
}: {
  /** Nama item, mis. "task". */
  noun: string
  actions?: BulkActionDef[]
  /** Route export daftar ini (filter sama); `ids=` ditambahkan otomatis. */
  exportHref?: string
  /** Daftar berhalaman: "Pilih semua" = semua di halaman ini. */
  paged?: boolean
}) {
  const c = useBulk()
  const router = useRouter()
  const [open, setOpen] = useState<BulkActionDef | null>(null)
  const [values, setValues] = useState<Record<string, string>>({})
  const [result, setResult] = useState<BulkResult | null>(null)
  const [pending, start] = useTransition()
  const panelId = useId()
  const formRef = useRef<HTMLFormElement>(null)
  // Panel isian menggantikan tombol aksi: pindahkan fokus ke isian pertama.
  useEffect(() => {
    if (open) formRef.current?.querySelector<HTMLElement>('select, input, button')?.focus()
  }, [open])
  const count = c.selected.size
  const ids = [...c.selected]

  if (c.all.length === 0 && !result) return null

  const scope = paged ? `semua di halaman ini (${c.all.length})` : `semua (${c.all.length})`

  function run(a: BulkActionDef) {
    const input = { ...values }
    start(async () => {
      const r = await a.run(ids, input)
      setResult(r)
      setOpen(null)
      setValues({})
      if (r.ok > 0) c.clear()
      router.refresh()
    })
  }

  function pick(a: BulkActionDef) {
    setResult(null)
    if (!needsPanel(a)) return run(a)
    setValues(a.select ? { [a.select.name]: '' } : {})
    setOpen(a)
  }

  const showText = open?.text && (!open.text.when || values[open.select?.name ?? ''] === open.text.when)
  const missing =
    (open?.select && !values[open.select.name]) || (showText && open?.text?.required && !values[open!.text!.name]?.trim())

  const join = exportHref?.includes('?') ? '&' : '?'

  return (
    <div className="mt-3">
      <div className="flex min-h-[44px] flex-wrap items-center gap-x-2 gap-y-1">
        <label className="inline-flex min-h-[44px] cursor-pointer items-center gap-1 pr-2 text-sm font-medium">
          <BulkSelectAllInline />
          <span>Pilih {scope}</span>
        </label>
      </div>

      {result && (
        <p
          role="status"
          className={`mt-2 flex items-start justify-between gap-2 rounded-lg border px-3 py-2 text-sm ${
            result.tone === 'success'
              ? 'border-green-300 bg-green-50 text-green-900 dark:border-green-800 dark:bg-green-950 dark:text-green-200'
              : result.tone === 'warning'
                ? 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200'
                : 'border-red-300 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-200'
          }`}
        >
          <span>{result.message}</span>
          <button type="button" onClick={() => setResult(null)} className="-my-2 -mr-2 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg" aria-label="Tutup pesan">
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4"><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
        </p>
      )}

      {count > 0 && (
        <div
          role="region"
          aria-label="Aksi untuk item terpilih"
          className="fixed inset-x-0 bottom-0 z-40 max-h-[70vh] overflow-y-auto border-t border-zinc-200 bg-white/95 px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(0,0,0,0.12)] backdrop-blur md:static md:z-auto md:mt-2 md:max-h-none md:overflow-visible md:rounded-2xl md:border md:border-kasuat-gold/60 md:bg-kasuat-off-white md:px-4 md:py-3 md:shadow-none md:backdrop-blur-none dark:border-zinc-700 dark:bg-zinc-900/95 md:dark:bg-zinc-900"
        >
          <div className="flex flex-wrap items-center gap-2">
            <p className="mr-auto text-sm font-semibold" aria-live="polite">
              <span className="rounded-full bg-kasuat-gold px-2 py-0.5 text-kasuat-black">{count}</span> {noun} dipilih
            </p>
            <button type="button" onClick={() => { c.clear(); setOpen(null) }} className={BTN_SECONDARY} disabled={pending}>
              Batal pilih
            </button>
          </div>

          {!open && (
            <div className="mt-2 flex flex-wrap gap-2">
              {actions.map((a) => (
                <button
                  key={a.key}
                  type="button"
                  disabled={pending}
                  onClick={() => pick(a)}
                  className={a.danger ? BTN_DANGER : BTN_SECONDARY}
                >
                  {a.label}
                </button>
              ))}
              {exportHref && (
                <ExportLink
                  href={`${exportHref}${join}ids=${ids.join(',')}`}
                  label="Export terpilih"
                  panelClassName="bottom-full mb-2 left-0 min-w-44 md:bottom-auto md:mb-0 sm:w-48"
                />
              )}
              {pending && <span className="self-center text-sm text-zinc-600 dark:text-zinc-400">Memproses…</span>}
            </div>
          )}

          {open && (
            <form
              ref={formRef}
              id={panelId}
              className="mt-3 grid gap-3 md:grid-cols-[minmax(0,16rem)_minmax(0,1fr)_auto] md:items-end"
              onSubmit={(e) => {
                e.preventDefault()
                if (!missing) run(open)
              }}
            >
              {open.select && (
                <label className="block text-sm font-medium">
                  {open.select.label}
                  <select
                    required
                    value={values[open.select.name] ?? ''}
                    onChange={(e) => setValues((v) => ({ ...v, [open.select!.name]: e.target.value }))}
                    className="mt-1 min-h-[44px] w-full rounded-lg border bg-white px-3 py-2 text-base dark:bg-zinc-800"
                  >
                    <option value="">Pilih…</option>
                    {open.select.options.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </label>
              )}
              {showText && open.text && (
                <label className="block text-sm font-medium md:col-span-1">
                  {open.text.label}
                  {open.text.required ? '' : ' (opsional)'}
                  <input
                    required={open.text.required}
                    maxLength={open.text.maxLength ?? 1000}
                    value={values[open.text.name] ?? ''}
                    onChange={(e) => setValues((v) => ({ ...v, [open.text!.name]: e.target.value }))}
                    className="mt-1 min-h-[44px] w-full rounded-lg border bg-white px-3 py-2 text-base dark:bg-zinc-800"
                  />
                </label>
              )}
              <div className="flex flex-wrap items-center gap-2 md:col-start-3">
                {(open.danger || open.confirm) && (
                  <p className="basis-full text-sm font-medium text-red-700 md:basis-auto dark:text-red-300">
                    {open.label} {count} {noun}?{open.danger ? ' Tidak bisa dibatalkan.' : ''}
                  </p>
                )}
                <button type="submit" disabled={pending || Boolean(missing)} className={open.danger ? `${BTN} bg-red-700 text-white hover:bg-red-800` : BTN_PRIMARY}>
                  {pending ? 'Memproses…' : `${open.label} (${count})`}
                </button>
                <button type="button" onClick={() => setOpen(null)} disabled={pending} className={BTN_SECONDARY}>
                  Kembali
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  )
}

/** Kotak "Pilih semua" (keadaan sebagian = indeterminate), di dalam label BulkBar. */
function BulkSelectAllInline() {
  const c = useBulk()
  const ref = useRef<HTMLInputElement>(null)
  const count = c.selected.size
  const all = c.all.length > 0 && count === c.all.length
  const some = count > 0 && !all
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = some
  }, [some])
  return (
    <span className="inline-flex h-11 w-11 items-center justify-center">
      <input
        ref={ref}
        type="checkbox"
        className="h-5 w-5 cursor-pointer accent-kasuat-deep-gold"
        checked={all}
        disabled={c.all.length === 0}
        onChange={() => c.setAll(!all)}
      />
    </span>
  )
}
