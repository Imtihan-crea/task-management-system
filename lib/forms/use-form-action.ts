'use client'

import { startTransition, useActionState, useEffect, useRef, type FormEvent } from 'react'

/**
 * Pengganti `useActionState` + `<form action={...}>` (audit A13, 8 Nov 2026).
 *
 * React 19 me-reset form uncontrolled setiap kali action selesai, termasuk
 * saat action mengembalikan `{ error }`: isian create hilang dan form edit
 * kembali ke nilai awal. Di sini form dikirim lewat `onSubmit` (tidak ada
 * reset otomatis), lalu di-reset manual hanya bila hasilnya tanpa `error`.
 *
 * Pakai: `const [state, formProps, pending] = useFormAction(action, INITIAL)`
 * lalu `<form {...formProps}>`.
 */
export function useFormAction<S extends { error?: string } | undefined>(
  action: (prev: Awaited<S>, formData: FormData) => Promise<S>,
  initial: Awaited<S>
) {
  const [state, dispatch, pending] = useActionState<S, FormData>(action, initial)
  const ref = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (state && !state.error) ref.current?.reset()
  }, [state])

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const submitter = (e.nativeEvent as SubmitEvent).submitter
    const formData = new FormData(e.currentTarget, submitter)
    startTransition(() => dispatch(formData))
  }

  return [state, { ref, onSubmit }, pending] as const
}
