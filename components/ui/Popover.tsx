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
}: {
  label: string
  button: ReactNode
  children: ReactNode
  align?: 'left' | 'right'
}) {
  const [open, setOpen] = useState(false)
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
        aria-label={label}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-zinc-700 px-3 py-2 text-sm font-medium text-zinc-200 hover:bg-zinc-800"
      >
        {button}
      </button>
      {open && (
        <div
          id={panelId}
          role="dialog"
          aria-label={label}
          className={`absolute z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-2xl border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900 ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
        >
          {children}
        </div>
      )}
    </div>
  )
}
