'use client'

import * as Sentry from '@sentry/nextjs'
import NextError from 'next/error'
import { useEffect } from 'react'

// Error yang menjatuhkan root layout; dikirim ke Sentry bila aktif.
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <html lang="id">
      <body>
        <NextError statusCode={0} />
      </body>
    </html>
  )
}
