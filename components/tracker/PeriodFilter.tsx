import Link from 'next/link'
import { MAX_RANGE_DAYS, type Period } from '@/lib/hr/period'
import { FIELD as INPUT, FIELD_LABEL, SUBMIT } from '@/components/ui/primitives'

/**
 * Form pilih periode (minggu / bulan / rentang) + tautan sebelum/sesudah.
 * Form GET biasa: field yang dipakai ditentukan oleh pilihan "Periode". Field periode lain
 * disembunyikan lewat CSS :has() (globals.css .period-form), jadi tetap jalan tanpa JS.
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
    <div className="period-form mt-4">
      <form className="grid grid-cols-2 items-end gap-3 md:grid-cols-[repeat(auto-fill,minmax(11rem,1fr))]">
        {Object.entries(keep).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
        <div>
          <label htmlFor="periode" className={FIELD_LABEL}>Periode</label>
          <select id="periode" name="periode" defaultValue={period.mode} className={INPUT}>
            <option value="minggu">Minggu</option>
            <option value="bulan">Bulan</option>
            <option value="rentang">Rentang tanggal</option>
          </select>
        </div>
        <div data-period="minggu">
          <label htmlFor="minggu" className={FIELD_LABEL}>Minggu</label>
          <input id="minggu" name="minggu" type="week" placeholder="2026-W47" pattern="\d{4}-W\d{2}" title="Bentuk tahun-W-minggu, mis. 2026-W47" defaultValue={period.mode === 'minggu' ? period.query.minggu : ''} className={INPUT} />
        </div>
        <div data-period="bulan">
          <label htmlFor="bulan" className={FIELD_LABEL}>Bulan</label>
          <input id="bulan" name="bulan" type="month" defaultValue={period.month ?? ''} className={INPUT} />
        </div>
        <div data-period="rentang">
          <label htmlFor="dari" className={FIELD_LABEL}>Dari</label>
          <input id="dari" name="dari" type="date" defaultValue={period.from} className={INPUT} />
        </div>
        <div data-period="rentang">
          <label htmlFor="sampai" className={FIELD_LABEL}>Sampai</label>
          <input id="sampai" name="sampai" type="date" defaultValue={period.to} className={INPUT} />
        </div>
        {children}
        <button type="submit" className={`col-span-2 md:col-span-1 ${SUBMIT}`}>Tampilkan</button>
      </form>
      <p data-period="rentang" className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">Rentang tanggal maksimal {MAX_RANGE_DAYS} hari.</p>
      {error && <p role="alert" className="mt-2 text-sm font-semibold text-red-700">{error} Menampilkan bulan ini.</p>}
      <nav aria-label="Pindah periode" className="mt-3 flex items-center justify-between gap-2 rounded-xl bg-zinc-50 p-1 text-sm font-semibold sm:inline-flex sm:justify-start dark:bg-zinc-800">
        <Link href={href(period.prev)} className="inline-flex min-h-[44px] items-center rounded-lg px-3 text-kasuat-deep-gold hover:bg-white dark:hover:bg-zinc-700"><span aria-hidden="true">‹&nbsp;</span>Sebelumnya</Link>
        <span className="min-w-0 text-center">{period.label}</span>
        <Link href={href(period.next)} className="inline-flex min-h-[44px] items-center rounded-lg px-3 text-kasuat-deep-gold hover:bg-white dark:hover:bg-zinc-700">Berikutnya<span aria-hidden="true">&nbsp;›</span></Link>
      </nav>
    </div>
  )
}
