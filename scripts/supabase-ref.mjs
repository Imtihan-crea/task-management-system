import { existsSync, readFileSync } from 'node:fs'

/** Project ref Supabase dari NEXT_PUBLIC_SUPABASE_URL (env atau .env.local). */
export function projectRef() {
  let url = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!url && existsSync('.env.local')) {
    url = readFileSync('.env.local', 'utf8').match(/^NEXT_PUBLIC_SUPABASE_URL=(.+)$/m)?.[1]
  }
  const ref = url?.trim().match(/^https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1]
  if (!ref) throw new Error('NEXT_PUBLIC_SUPABASE_URL tidak ditemukan.')
  return ref
}
