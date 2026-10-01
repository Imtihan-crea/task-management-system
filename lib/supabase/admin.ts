import 'server-only'

import { createClient as createSupabaseClient } from '@supabase/supabase-js'

/**
 * Client dengan SERVICE ROLE.
 *
 * ATURAN KERAS (PRD section 28 & 38 Rule 10):
 * - Hanya boleh dipakai di file server (Server Action / Route Handler / Server Component).
 * - File ini memakai `server-only` supaya tidak bisa ikut ke bundle browser.
 * - Admin check SELALU dilakukan di server sebelum memakai client ini.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRoleKey) {
    throw new Error('Supabase server credentials are not configured.')
  }

  return createSupabaseClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}
