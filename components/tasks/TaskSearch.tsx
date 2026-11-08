'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useRef, useState } from 'react'

/**
 * Search dengan debounce 400ms (§14). Update URL tanpa reload —
 * input tidak kehilangan fokus, shell/header tetap.
 * Parent memberi key={q} sehingga reset saat URL berubah dari luar.
 */
export function DebouncedTaskSearch({ initial }: { initial: string }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [value, setValue] = useState(initial)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function commit(v: string) {
    const params = new URLSearchParams(searchParams.toString())
    const q = v.trim()
    if (q) params.set('q', q)
    else params.delete('q')
    params.delete('page')
    router.replace(`/tasks?${params.toString()}`)
  }

  function onChange(v: string) {
    setValue(v)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => commit(v), 400)
  }

  // Bukan <form>: komponen ini dipasang di dalam <form method="get"> milik
  // TaskFilterForm. Form bersarang tidak sah di HTML; browser membuang form
  // dalam sehingga hydration gagal (React error #418 di /tasks).
  return (
    <div role="search" aria-label="Cari task">
      <label htmlFor="task-search" className="mb-1 block text-sm font-medium">
        Cari
      </label>
      <input
        id="task-search"
        name="q"
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          // Enter: cari sekarang tanpa reload (jangan kirim form filter induk).
          if (e.key !== 'Enter') return
          e.preventDefault()
          if (timer.current) clearTimeout(timer.current)
          commit(value)
        }}
        placeholder="Kode (T-01), nama, project, assignee"
        autoComplete="off"
        className="min-h-[44px] w-full rounded-lg border px-3 py-2 text-base dark:border-zinc-700 dark:bg-zinc-800"
      />
    </div>
  )
}
