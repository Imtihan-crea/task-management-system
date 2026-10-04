/**
 * Verifikasi nyata: apakah sintaks `or=` yang dipakai scopeFilter()
 * diterima PostgREST? Dijalankan dengan client supabase-js yang sama
 * dengan aplikasi (bukan request manual), jadi persis jalur kode nyata.
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const env: Record<string, string> = {}
for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = /^([A-Z_]+)=(.*)$/.exec(line)
  if (m) env[m[1]] = m[2].trim()
}

const url = env.NEXT_PUBLIC_SUPABASE_URL!
const key = env.SUPABASE_SERVICE_ROLE_KEY!
const db = createClient(url, key, { auth: { persistSession: false } })

let ok = 0
let gagal = 0

function cek(label: string, lulus: boolean, detail = ''): void {
  if (lulus) {
    ok++
    console.log(`  [OK]    ${label}`)
  } else {
    gagal++
    console.log(`  [GAGAL] ${label}${detail ? ` -> ${detail}` : ''}`)
  }
}

async function orCount(table: string, orIsi: string, column = 'code'): Promise<{ n: number; err: string }> {
  const { data, error } = await db.from(table).select(column).or(orIsi)
  if (error) return { n: -1, err: `${error.code ?? ''} ${error.message}` }
  return { n: data?.length ?? 0, err: '' }
}

async function main() {
  console.log('=== referensi: projects yang ada ===')
  const { data: projects, error: e1 } = await db.from('projects').select('id, code').limit(5)
  cek('baca projects', !e1, e1?.message)
  const pl = projects ?? []
  console.log(`  ${pl.length} project: ${pl.map((p) => p.code).join(', ')}`)

  if (pl.length >= 2) {
    const p1 = pl[0].id
    const p2 = pl[1].id
    const c2 = pl[1].code

    console.log('')
    console.log('=== 1) or 1 clause: id.in.(p1) ===')
    const r1 = await orCount('projects', `id.in.(${p1})`)
    cek('diterima & tepat 1 baris', r1.n === 1, `n=${r1.n} ${r1.err}`)

    console.log('')
    console.log('=== 2) or 2 clause (format yang dipakai scopeFilter) ===')
    const r2 = await orCount('projects', `id.in.(${p1}),code.in.(${c2})`)
    cek('diterima & tepat 2 baris', r2.n === 2, `n=${r2.n} ${r2.err}`)

    console.log('')
    console.log('=== 3) multi clause yang TIDAK overlap -> harus 1 ===')
    const r3 = await orCount('projects', `id.in.(${p2}),code.in.(${c2})`)
    cek('OR semantics benar (1 baris)', r3.n === 1, `n=${r3.n} ${r3.err}`)
  }

  console.log('')
  console.log('=== 4) kasus tanpa akses: id.eq.UUID_nol -> 0 baris ===')
  const r4 = await orCount('projects', 'id.eq.00000000-0000-0000-0000-000000000000')
  cek('0 baris (tidak bocor)', r4.n === 0, `n=${r4.n} ${r4.err}`)

  console.log('')
  console.log('=== 5) bentuk alternatif id.in.(UUID_nol) ===')
  const r5 = await orCount('projects', 'id.in.(00000000-0000-0000-0000-000000000000)')
  cek('0 baris (tidak bocor)', r5.n === 0, `n=${r5.n} ${r5.err}`)

  console.log('')
  console.log('=== 6) pada tabel meetings (kosong) ===')
  const r6 = await orCount('meetings', 'id.in.(00000000-0000-0000-0000-000000000000)', 'id')
  cek('diterima & 0 baris', r6.n === 0, `n=${r6.n} ${r6.err}`)

  console.log('')
  console.log(`LULUS: ${ok}`)
  console.log(`GAGAL: ${gagal}`)
  if (gagal > 0) process.exit(1)
}

void main()