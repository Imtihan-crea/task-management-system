/**
 * Bandingkan file database/migrations/NNN_*.sql dengan tabel
 * public.app_migrations di project Supabase (lewat Supabase CLI).
 * Jalankan: npm run db:status   (project ref dari NEXT_PUBLIC_SUPABASE_URL
 * di environment atau .env.local; tidak mencetak secret apa pun).
 */
import { execFileSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { projectRef } from './supabase-ref.mjs'

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
