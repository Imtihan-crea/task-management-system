import * as Sentry from '@sentry/nextjs'
import type { Instrumentation } from 'next'
import { sentryOptions } from './lib/monitoring/sentry-options'

// Sentry hanya aktif bila SENTRY_DSN diisi (env Vercel); tanpa DSN tidak ada yang dikirim.
export async function register() {
  if (process.env.SENTRY_DSN) {
    Sentry.init({ dsn: process.env.SENTRY_DSN, ...sentryOptions })
  }
}

export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  Sentry.captureRequestError(error, request, context)
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  const { sendErrorAlert } = await import('./lib/monitoring/send-error-alert')
  await sendErrorAlert({
    error,
    path: request.path,
    method: request.method,
    routePath: context.routePath,
    routeType: context.routeType,
    now: new Date(),
  })
}
