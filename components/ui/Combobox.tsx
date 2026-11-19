'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { filterOptions } from '@/lib/utils/combobox-filter'

const INPUT = 'w-full rounded-lg border px-3 py-2 text-base outline-none focus:border-black dark:border-zinc-700 dark:bg-zinc-800'

/**
 * Kolom teks dengan daftar saran yang terbuka saat diklik atau difokus dan
 * menyaring saat mengetik. Ketikan di luar daftar tetap diterima (teks bebas),
 * nilainya dikirim lewat input bernama `name` seperti input biasa.
 */
export function Combobox({
  id,
  name,
  options,
  defaultValue = '',
  required,
  maxLength,
  describedBy,
}: {
  id: string
  name: string
  options: string[]
  defaultValue?: string
  required?: boolean
  maxLength?: number
  describedBy?: string
}) {
  const listId = useId()
  const [value, setValue] = useState(defaultValue)
  const [typed, setTyped] = useState(false) // saring hanya setelah pengguna mengetik
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const activeRef = useRef<HTMLLIElement>(null)

  const shown = typed ? filterOptions(options, value) : options
  const expanded = open && shown.length > 0

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest' })
  }, [active])

  function choose(v: string) {
    setValue(v)
    setTyped(false)
    setOpen(false)
    setActive(-1)
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (shown.length === 0) return
      e.preventDefault()
      setOpen(true)
      const step = e.key === 'ArrowDown' ? 1 : -1
      setActive((a) => (a + step + shown.length) % shown.length)
    } else if (e.key === 'Enter' && expanded && active >= 0) {
      e.preventDefault()
      choose(shown[active])
    } else if (e.key === 'Escape' && expanded) {
      e.preventDefault()
      setOpen(false)
      setActive(-1)
    }
  }

  return (
    <div className="relative">
      <input
        id={id}
        name={name}
        required={required}
        maxLength={maxLength}
        autoComplete="off"
        role="combobox"
        aria-expanded={expanded}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={expanded && active >= 0 ? `${listId}-${active}` : undefined}
        aria-describedby={describedBy}
        value={value}
        onChange={(e) => {
          setValue(e.target.value)
          setTyped(true)
          setOpen(true)
          setActive(-1)
        }}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onBlur={() => {
          setOpen(false)
          setActive(-1)
        }}
        onKeyDown={onKeyDown}
        className={INPUT}
      />
      <ul
        id={listId}
        role="listbox"
        hidden={!expanded}
        className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-lg border bg-white py-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-800"
      >
        {shown.map((o, i) => (
          <li
            key={o}
            id={`${listId}-${i}`}
            ref={i === active ? activeRef : undefined}
            role="option"
            aria-selected={o === value}
            // mouseDown + preventDefault: input tidak kehilangan fokus sebelum pilihan terbaca.
            onMouseDown={(e) => {
              e.preventDefault()
              choose(o)
            }}
            className={`flex min-h-[44px] cursor-pointer items-center px-3 py-2 text-base ${i === active ? 'bg-kasuat-gold/30' : 'hover:bg-zinc-100 dark:hover:bg-zinc-700'}`}
          >
            {o}
          </li>
        ))}
      </ul>
    </div>
  )
}
