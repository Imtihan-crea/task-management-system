'use client'

import { useEffect, useId, useRef, useState, type ReactNode } from 'react'

/**
 * Popover aksesibel (§24, §31): tombol toggle + panel.
 * Esc menutup, klik di luar menutup, fokus kembali ke tombol.
 */
export function Popover({
  label,
  button,
  children,
  align = 'right',
  nameFromContent = false,
  open: openProp,
  onOpenChange,
  bare = false,
  panelClassName = 'w-80',
}: {
  label: string
  button: ReactNode
  children: ReactNode
  align?: 'left' | 'right'
  /** Nama tombol diambil dari isinya (ada teks terlihat), bukan aria-label: hindari label-content-name-mismatch. */
  nameFromContent?: boolean
  /** Opsional: kendalikan buka/tutup dari luar (mis. muat data saat dibuka). */
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /** Tombol tanpa bingkai (ikon di topbar). */
  bare?: boolean
  panelClassName?: string
}) {
  const [innerOpen, setInnerOpen] = useState(false)
  const open = openProp ?? innerOpen
  const setOpen = (v: boolean | ((prev: boolean) => boolean)) => {
    const next = typeof v === 'function' ? v(open) : v
    setInnerOpen(next)
    onOpenChange?.(next)
  }
  const panelId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        buttonRef.current?.focus()
      }
    }
    const onClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onClick)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onClick)
    }
  }, [open ])

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-label={nameFromContent ? undefined : label}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1.5 rounded-lg text-sm font-medium text-zinc-800 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800 ${
          bare ? 'px-2' : 'w-full border border-zinc-300 bg-white px-3 py-2 font-semibold dark:border-zinc-700 dark:bg-transparent'
        }`}
      >
        {button}
      </button>
      {open && (
        <div
          id={panelId}
          role="dialog"
          aria-label={label}
          className={`absolute z-50 mt-2 ${panelClassName} max-w-[calc(100vw-2rem)] rounded-2xl border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900 ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
        >
          {children}
        </div>
      )}
    </div>
  )
}
