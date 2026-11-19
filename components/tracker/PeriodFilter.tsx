import Link from 'next/link'
import { MAX_RANGE_DAYS, type Period } from '@/lib/hr/period'

const INPUT = 'rounded-lg border px-3 py-2 text-base dark:border-zinc-700 dark:bg-zinc-800'

/**
 * Form pilih periode (minggu / bulan / rentang) + tautan sebelum/sesudah.
 * Form GET biasa: field yang dipakai ditentukan oleh pilihan "Periode".
 * `base` = path halaman, `keep` = parameter lain yang dipertahankan (mis. divisi).
 */
export function PeriodFilter({ period, error, base, keep = {}, navKeep = {}, children }: {
  period: Period
  error: string | null
  base: string
  keep?: Record<string, string>
  /** Parameter yang hanya ikut tautan sebelum/sesudah (sudah ada sebagai field di `children`, mis. divisi). */
  navKeep?: Record<string, string>
  children?: React.ReactNode
}) {
  const href = (q: Record<string, string>) => `${base}?${new URLSearchParams({ ...keep, ...navKeep, ...q }).toString()}`
  return (
    <div className="mt-4">
      <form className="flex flex-wrap items-end gap-3">
        {Object.entries(keep).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
        <div>
          <label htmlFor="periode" className="mb-1 block text-sm font-medium">Periode</label>
          <select id="periode" name="periode" defaultValue={period.mode} className={INPUT}>
            <option value="minggu">Minggu</option>
            <option value="bulan">Bulan</option>
            <option value="rentang">Rentang tanggal</option>
          </select>
        </div>
        <div>
          <label htmlFor="minggu" className="mb-1 block text-sm font-medium">Minggu</label>
          <input id="minggu" name="minggu" type="week" placeholder="2026-W47" pattern="\d{4}-W\d{2}" title="Bentuk tahun-W-minggu, mis. 2026-W47" defaultValue={period.mode === 'minggu' ? period.query.minggu : ''} className={INPUT} />
        </div>
        <div>
          <label htmlFor="bulan" className="mb-1 block text-sm font-medium">Bulan</label>
          <input id="bulan" name="bulan" type="month" defaultValue={period.month ?? ''} className={INPUT} />
        </div>
        <div>
          <label htmlFor="dari" className="mb-1 block text-sm font-medium">Dari</label>
          <input id="dari" name="dari" type="date" defaultValue={period.from} className={INPUT} />
        </div>
        <div>
          <label htmlFor="sampai" className="mb-1 block text-sm font-medium">Sampai</label>
          <input id="sampai" name="sampai" type="date" defaultValue={period.to} className={INPUT} />
        </div>
        {children}
        <button type="submit" className="min-h-[44px] rounded-lg bg-kasuat-gold px-4 py-2 font-semibold text-kasuat-black">Tampilkan</button>
      </form>
      <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">Rentang tanggal maksimal {MAX_RANGE_DAYS} hari.</p>
      {error && <p role="alert" className="mt-2 text-sm font-semibold text-red-700">{error} Menampilkan bulan ini.</p>}
      <nav aria-label="Pindah periode" className="mt-3 flex flex-wrap items-center gap-3 text-sm font-semibold">
        <Link href={href(period.prev)} className="text-kasuat-deep-gold hover:underline">Sebelumnya</Link>
        <span>{period.label}</span>
        <Link href={href(period.next)} className="text-kasuat-deep-gold hover:underline">Berikutnya</Link>
      </nav>
    </div>
  )
}
