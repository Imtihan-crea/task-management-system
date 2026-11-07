/**
 * Bandingkan file database/migrations/NNN_*.sql dengan tabel
 * public.app_migrations di project Supabase (lewat Supabase CLI).
 * Jalankan: npm run db:status   (project ref dari NEXT_PUBLIC_SUPABASE_URL
 * di environment atau .env.local; tidak mencetak secret apa pun).
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'

function projectRef() {
  let url = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!url && existsSync('.env.local')) {
    url = readFileSync('.env.local', 'utf8').match(/^NEXT_PUBLIC_SUPABASE_URL=(.+)$/m)?.[1]
  }
  const ref = url?.trim().match(/^https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1]
  if (!ref) throw new Error('NEXT_PUBLIC_SUPABASE_URL tidak ditemukan.')
  return ref
}

const files = readdirSync('database/migrations')
  .map((f) => f.match(/^(\d{3})_.+\.sql$/)?.[1])
  .filter(Boolean)
  .sort()

const out = execFileSync(
  'supabase',
  ['db', 'query', `--remote=${projectRef()}`, '--read-only', '--agent', 'no', '-o', 'json',
    'select version from public.app_migrations order by version'],
  { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }
)
const applied = new Set(JSON.parse(out.slice(out.indexOf('['))).map((r) => r.version))

const pending = files.filter((v) => !applied.has(v))
const unknown = [...applied].filter((v) => !files.includes(v))

console.log(`File migrasi: ${files.length}, tercatat di database: ${applied.size}`)
if (pending.length) console.log(`BELUM JALAN: ${pending.join(', ')}`)
if (unknown.length) console.log(`Tercatat tapi tidak ada file: ${unknown.join(', ')}`)
if (!pending.length && !unknown.length) console.log('SINKRON')
process.exit(pending.length || unknown.length ? 1 : 0)
