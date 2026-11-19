import type { ReactNode } from 'react'
import Link from 'next/link'

/**
 * Kasuat design system primitives (§69).
 * Satu komponen = satu aturan visual. Semua warna/font dari tokens,
 * bukan hardcoded di masing-masing page.
 */

export function Button({
  children,
  variant = 'primary',
  className = '',
  ...props
}: {
  children: ReactNode
  variant?: 'primary' | 'secondary' | 'danger'
  className?: string
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const styles =
    variant === 'primary'
      ? 'bg-kasuat-gold text-kasuat-black hover:bg-kasuat-deep-gold'
      : variant === 'danger'
        ? 'border border-red-300 text-red-600 dark:border-red-700 dark:text-red-300'
        : 'border border-zinc-300 bg-white text-kasuat-black hover:bg-zinc-50 dark:border-zinc-700 dark:bg-transparent dark:text-zinc-100 dark:hover:bg-zinc-800'

  return (
    <button
      className={`inline-flex min-h-[44px] items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50 ${styles} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}

export function ButtonLink({
  href,
  children,
  variant = 'primary',
}: {
  href: string
  children: ReactNode
  variant?: 'primary' | 'secondary' | 'danger'
}) {
  const styles =
    variant === 'primary'
      ? 'bg-kasuat-gold text-kasuat-black hover:bg-kasuat-deep-gold'
      : variant === 'danger'
        ? 'border border-red-300 text-red-600 dark:border-red-700 dark:text-red-300'
        : 'border border-zinc-300 bg-white text-kasuat-black hover:bg-zinc-50 dark:border-zinc-700 dark:bg-transparent dark:text-zinc-100 dark:hover:bg-zinc-800'

  return (
    <Link
      href={href}
      className={`inline-flex min-h-[44px] items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold ${styles}`}
    >
      {children}
    </Link>
  )
}

export function Card({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      {children}
    </div>
  )
}

export function KpiCard({
  label,
  value,
  hint,
}: {
  label: string
  value: number | string
  /** Keterangan kecil di dalam kartu (mis. "+2 dari bulan lalu"). */
  hint?: string
}) {
  return (
    <div className="h-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 sm:p-3 dark:border-zinc-800 dark:bg-zinc-900">
      <p className="text-xs font-medium leading-snug text-zinc-600 dark:text-zinc-400">{label}</p>
      <p className="mt-0.5 flex flex-wrap items-baseline gap-x-2">
        <span className="font-heading text-lg font-bold leading-tight text-kasuat-deep-gold sm:text-xl">{value}</span>
        {hint && <span className="text-xs text-zinc-600 dark:text-zinc-400">{hint}</span>}
      </p>
    </div>
  )
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string
  subtitle?: string
  /** Urutkan aksi utama lebih dulu; di HP aksi turun ke baris sendiri. */
  actions?: ReactNode
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h1 className="font-heading text-xl font-bold">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-zinc-600 dark:text-zinc-400">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 sm:shrink-0 [&>*:not(:only-child)]:grow sm:[&>*:not(:only-child)]:grow-0">{actions}</div>}
    </div>
  )
}

/** Kelas bersama untuk form filter GET: kolom seragam, satu-dua baris di laptop. */
export const FILTER_GRID = 'grid gap-3 sm:grid-cols-2 md:grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] md:items-end'
export const FIELD =
  'min-h-[44px] w-full min-w-0 rounded-lg border bg-white px-3 py-2 text-base dark:bg-zinc-800'
export const FIELD_LABEL = 'mb-1 block text-sm font-medium'
export const SUBMIT =
  'min-h-[44px] w-full rounded-lg bg-kasuat-gold px-5 py-2 font-semibold text-kasuat-black hover:bg-kasuat-light-gold'

/**
 * Panel filter: di HP terlipat di balik tombol "Filter" (terbuka bila ada filter aktif),
 * di laptop selalu terbuka (globals.css .filter-panel). <details> asli: jalan tanpa JS dan bisa keyboard.
 */
export function FilterPanel({ active = 0, children }: { active?: number; children: ReactNode }) {
  return (
    <details
      open={active > 0}
      className="filter-panel group mt-4 rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
    >
      <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between gap-2 rounded-2xl px-4 py-2 text-sm font-semibold [&::-webkit-details-marker]:hidden">
        <span className="inline-flex items-center gap-2">
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="h-4 w-4">
            <path d="M3 5h18M6 12h12M10 19h4" />
          </svg>
          Filter
          {active > 0 && (
            <span className="rounded-full bg-kasuat-gold px-2 py-0.5 text-xs font-bold text-kasuat-black">
              {active} aktif
            </span>
          )}
        </span>
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4 transition-transform group-open:rotate-180">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </summary>
      <div className="border-t border-zinc-200 p-4 md:border-0 dark:border-zinc-800">{children}</div>
    </details>
  )
}

/** Wadah tabel lebar: geser ke samping dengan bayangan di tepi sebagai petunjuk. */
export function TableScroll({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`scroll-x-hint overflow-x-auto rounded-2xl border border-zinc-200 dark:border-zinc-800 ${className}`}>
      {children}
    </div>
  )
}

export function EmptyState({
  title,
  message,
  action,
}: {
  title: string
  message?: string
  action?: ReactNode
}) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-8 text-center dark:border-zinc-800 dark:bg-zinc-900">
      <p className="font-heading text-lg font-semibold">{title}</p>
      {message && <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{message}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  )
}
