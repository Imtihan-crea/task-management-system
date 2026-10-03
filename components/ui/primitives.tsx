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
        : 'border border-zinc-300 text-kasuat-black dark:border-zinc-700 dark:text-zinc-100'

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
        : 'border border-zinc-300 text-kasuat-black dark:border-zinc-700 dark:text-zinc-100'

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

export function KpiCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
      <p className="font-heading text-xl font-bold text-kasuat-deep-gold">{value}</p>
      <p className="mt-0.5 text-xs font-semibold tracking-wide text-zinc-500">{label}</p>
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
  actions?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div>
        <h1 className="font-heading text-xl font-bold">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-zinc-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
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
      {message && <p className="mt-1 text-sm text-zinc-500">{message}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  )
}
