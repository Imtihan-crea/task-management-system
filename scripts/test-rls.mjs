/**
 * Jalankan database/tests/rls.check.sql ke project Supabase (Supabase CLI).
 * Transaksi selalu di-rollback oleh file SQL-nya; tidak ada data tersimpan.
 * Jalankan: npm run test:rls   (tidak masuk CI: butuh login Supabase CLI)
 */
import { spawnSync } from 'node:child_process'
import { projectRef } from './supabase-ref.mjs'

const run = spawnSync(
  'supabase',
  ['db', 'query', `--remote=${projectRef()}`, '--yes', '--agent', 'no', '-f', 'database/tests/rls.check.sql'],
  { encoding: 'utf8' }
)
const text = `${run.stdout}\n${run.stderr}`
// Jumlah cek di database/tests/rls.check.sql; ubah bila menambah/mengurangi cek.
const EXPECTED_TOTAL = 26

const match = text.match(/HASIL_RLS total=(\d+) gagal=(\d+) :: (.*?)(?:\\n|\n|")/)
if (!match) {
  console.error('Tes RLS tidak menghasilkan HASIL_RLS:\n' + text.slice(-800))
  process.exit(1)
}
const total = Number(match[1])
let gagal = Number(match[2])
if (gagal > 0) for (const f of match[3].split(' ;; ')) console.log(`  [GAGAL] ${f}`)
if (total !== EXPECTED_TOTAL) {
  console.log(`  [GAGAL] jumlah cek ${total}, seharusnya ${EXPECTED_TOTAL}`)
  gagal++
}
console.log(`LULUS: ${total - Number(match[2])}`)
console.log(`GAGAL: ${gagal}`)
if (gagal > 0) process.exit(1)
