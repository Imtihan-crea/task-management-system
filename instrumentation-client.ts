import * as Sentry from '@sentry/nextjs'
import { sentryOptions } from './lib/monitoring/sentry-options'

// Error di browser ke Sentry, hanya bila NEXT_PUBLIC_SENTRY_DSN diisi.
if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({ dsn: process.env.NEXT_PUBLIC_SENTRY_DSN, ...sentryOptions })
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
