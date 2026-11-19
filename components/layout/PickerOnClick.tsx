'use client'

import { useEffect } from 'react'

const PICKER_TYPES = new Set(['date', 'time', 'month', 'datetime-local'])

/** Satu listener global: klik di mana pun pada kolom tanggal/jam membuka picker bawaan. */
export function PickerOnClick() {
  useEffect(() => {
    function onClick(e: MouseEvent) {
      const el = e.target
      if (!(el instanceof HTMLInputElement) || !PICKER_TYPES.has(el.type) || el.readOnly || el.disabled) return
      try {
        el.showPicker()
      } catch {
        // browser tanpa showPicker atau picker sudah terbuka: abaikan
      }
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [])
  return null
}
