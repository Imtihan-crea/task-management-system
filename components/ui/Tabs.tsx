'use client'

import Link from 'next/link'
import { useEffect, useRef } from 'react'

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
  const listRef = useRef<HTMLDivElement>(null)
  // Tab aktif yang berada di luar layar HP digeser masuk supaya terlihat.
  useEffect(() => {
    const list = listRef.current
    const active = list?.querySelector<HTMLElement>('[aria-selected="true"]')
    if (!list || !active) return
    const overflowRight = active.getBoundingClientRect().right - list.getBoundingClientRect().right
    if (overflowRight > 0) list.scrollLeft += overflowRight + 24
  }, [items])

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={label}
      className="scroll-x-hint hint-page flex snap-x gap-1 overflow-x-auto border-b border-zinc-200 [scrollbar-width:none] dark:border-zinc-800"
    >
      {items.map((item) => (
        <Link
          key={item.key}
          href={item.href}
          role="tab"
          aria-selected={item.active}
          className={`inline-flex min-h-[44px] shrink-0 snap-start items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-sm transition-colors ${
            item.active
              ? 'border-kasuat-deep-gold font-semibold text-kasuat-black dark:text-zinc-100'
              : 'border-transparent font-medium text-zinc-600 dark:text-zinc-400 hover:text-kasuat-black dark:hover:text-zinc-200'
          }`}
        >
          {item.label}
          {typeof item.count === 'number' && (
            <span
              className={`rounded-full px-1.5 py-0.5 text-xs font-semibold ${
                item.active
                  ? 'bg-kasuat-gold text-kasuat-black'
                  : 'bg-zinc-100 text-zinc-600 dark:text-zinc-400 dark:bg-zinc-800'
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
