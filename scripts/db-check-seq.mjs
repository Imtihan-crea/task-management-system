/**
 * Cek urutan kode (task/suggestion/meeting/project) terhadap data; HANYA MEMBACA.
 * Menandai: (a) urutan tertinggal dari kode terbesar (insert berikut bentrok),
 * (b) default lpad lama yang akan memotong nilai berikutnya (lihat migrasi 017).
 * Jalankan: npm run db:check-seq   (butuh login Supabase CLI; exit 1 bila ada tanda)
 */
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { projectRef } from './supabase-ref.mjs'

/** Murni, dipakai juga oleh self-check: baris query -> daftar tanda. */
export function tandai(r) {
  const berikut = r.is_called ? Number(r.last_value) + 1 : Number(r.last_value)
  const tanda = []
  if (r.max_kode !== null && berikut <= Number(r.max_kode)) {
    tanda.push(`urutan tertinggal: nilai berikut ${berikut} <= kode terbesar ${r.max_kode}`)
  }
  const lebar = r.default_expr?.match(/,\s*(\d+),\s*'0'/)?.[1]
  if (lebar && String(berikut).length > Number(lebar)) {
    tanda.push(`default lpad lebar ${lebar} akan memotong nilai berikut ${berikut} (perlu migrasi 017)`)
  }
  return tanda
}

if (process.argv[1]?.endsWith('db-check-seq.mjs')) {
  const run = spawnSync('supabase',
    ['db', 'query', `--remote=${projectRef()}`, '--read-only', '--agent', 'no', '-o', 'json',
      readFileSync('database/tests/seq.check.sql', 'utf8')],
    { encoding: 'utf8' })
  const out = run.stdout ?? ''
  let rows
  try { rows = JSON.parse(out.slice(out.indexOf('['))) } catch {
    console.error(`Gagal membaca hasil. Cek 'supabase login' ke akun pemilik project, lalu ulangi.\n${(run.stderr ?? '').slice(-500)}`)
    process.exit(1)
  }
  let ada = false
  for (const r of rows) {
    const t = tandai(r)
    ada ||= t.length > 0
    console.log(`${r.nama}: last_value=${r.last_value} (is_called=${r.is_called}) kode_terbesar=${r.max_kode ?? '-'}`)
    console.log(`  default: ${r.default_expr}`)
    for (const x of t) console.log(`  [TANDA] ${x}`)
  }
  console.log(ada ? 'ADA TANDA' : 'AMAN')
  process.exit(ada ? 1 : 0)
}
