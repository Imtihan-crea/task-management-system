'use client'

import Link from 'next/link'

export type TabItem = {
  key: string
  label: string
  count?: number
  href: string
  active: boolean
}

/**
 * Tabs reusable (§9, §24). Secondary navigation berbasis URL —
 * refresh & Back/Forward mempertahankan state (§10).
 */
export function Tabs({ items, label }: { items: TabItem[]; label: string }) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className="flex gap-1 overflow-x-auto border-b border-zinc-200 pb-px dark:border-zinc-800"
    >
      {items.map((item) => (
        <Link
          key={item.key}
          href={item.href}
          role="tab"
          aria-selected={item.active}
          className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
            item.active
              ? 'border-kasuat-gold text-kasuat-black dark:text-zinc-100'
              : 'border-transparent text-zinc-500 hover:text-kasuat-black dark:hover:text-zinc-200'
          }`}
        >
          {item.label}
          {typeof item.count === 'number' && (
            <span
              className={`rounded-full px-1.5 py-0.5 text-xs font-semibold ${
                item.active
                  ? 'bg-kasuat-gold text-kasuat-black'
                  : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800'
              }`}
            >
              {item.count}
            </span>
          )}
        </Link>
      ))}
    </div>
  )
}
