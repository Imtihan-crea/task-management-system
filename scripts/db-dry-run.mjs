/**
 * Uji-coba migrasi TANPA menyimpan apa pun: satu transaksi = begin + file
 * migrasi + cek, ditutup `raise exception 'HASIL_DRYRUN ...'` sehingga semua di-rollback
 * (termasuk insert ke app_migrations).
 * Jalankan: npm run db:dry-run -- 016   |   -- 017   |   -- 016,017
 * Butuh login Supabase CLI ke akun pemilik project (tidak masuk CI).
 *
 * Satu pengecualian disengaja: setval/nextval pada sequence TIDAK ikut rollback di
 * Postgres. Karena itu pernyataan `select setval(...)` milik 017 dibuang dari teks
 * uji-coba (tetap dijalankan saat migrasi asli), dan cek nextval memakai sequence TEMP.
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import { projectRef } from './supabase-ref.mjs'

const versi = (process.argv[2] ?? '').split(',').map((v) => v.trim()).filter(Boolean)
const dikenal = ['016', '017']
if (!versi.length || versi.some((v) => !dikenal.includes(v))) {
  console.error(`Pakai: npm run db:dry-run -- 016   (atau 017, atau 016,017). Dikenal: ${dikenal.join(', ')}.`)
  process.exit(2)
}
versi.sort()

const migrasi = (v) => {
  const f = readdirSync('database/migrations').find((n) => n.startsWith(`${v}_`))
  let sql = readFileSync(path.join('database/migrations', f), 'utf8')
  if (v === '017') {
    sql = sql.replace(/^select setval\([\s\S]*?\);\n/m, '-- (setval task_code_seq dibuang pada dry-run: sequence tidak ikut rollback)\n')
  }
  if (/\bsetval\s*\(/.test(sql.replace(/--.*$/gm, '')) || /^\s*(begin|commit)\s*;/im.test(sql)) {
    throw new Error(`${f}: masih ada setval/begin/commit; dry-run dibatalkan demi keamanan.`)
  }
  return `-- ===== ${f} =====\n${sql}`
}

// rls.check.sql: buang `begin;` dan blok `raise exception 'HASIL_RLS'` di akhir; hasilnya disalin ke dry_hasil.
const rlsBody = () => {
  const sql = readFileSync('database/tests/rls.check.sql', 'utf8')
  const akhir = sql.lastIndexOf('do $$')
  if (akhir < 0 || !sql.slice(akhir).includes("'HASIL_RLS")) throw new Error('rls.check.sql: blok akhir HASIL_RLS tidak ditemukan.')
  return sql.slice(0, akhir).replace(/^begin;\s*$/m, '') +
    "\nreset role;\ninsert into dry_hasil select 'RLS: ' || nama, lulus, detail from hasil;\n"
}

const cek017 = `
do $c$
declare
  r record; expr text; hasil_next text;
begin
  for r in select * from (values ('tasks','T-'),('task_suggestions','S-'),('meetings','M-'),('projects','')) v(tabel, awalan) loop
    select pg_get_expr(d.adbin, d.adrelid) into expr
    from pg_attrdef d join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
    where d.adrelid = ('public.' || r.tabel)::regclass and a.attname = 'code';
    insert into dry_hasil values ('017: default ' || r.tabel || '.code memanggil next_code',
      coalesce(expr, '') like '%next_code(%' and coalesce(expr, '') not like '%lpad(%', expr);
  end loop;
  create temp sequence dry_seq;
  perform setval('dry_seq', 123, false);
  hasil_next := public.next_code('T-', 'dry_seq'::regclass, 2);
  insert into dry_hasil values ('017: next_code(T-, seq=123, 2) = T-123', hasil_next = 'T-123', hasil_next);
  perform setval('dry_seq', 9, false);
  hasil_next := public.next_code('T-', 'dry_seq'::regclass, 2);
  insert into dry_hasil values ('017: next_code(T-, seq=9, 2) = T-09', hasil_next = 'T-09', hasil_next);
  perform setval('dry_seq', 7, false);
  hasil_next := public.next_code('', 'dry_seq'::regclass, 3);
  insert into dry_hasil values ('017: next_code(, seq=7, 3) = 007', hasil_next = '007', hasil_next);
  insert into dry_hasil values ('017: app_migrations mencatat 017 (dalam transaksi)',
    exists (select 1 from public.app_migrations where version = '017'), null);
end
$c$;
`

const bagian = ['begin;', 'create temp table dry_hasil (nama text, lulus boolean, detail text);']
for (const v of versi) bagian.push(migrasi(v))
if (versi.includes('016')) bagian.push(rlsBody())
if (versi.includes('017')) bagian.push(cek017)
bagian.push(`do $$
begin
  raise exception 'HASIL_DRYRUN total=% gagal=% :: %',
    (select count(*) from dry_hasil),
    (select count(*) from dry_hasil where not lulus),
    coalesce((select string_agg(nama || ' (' || coalesce(detail, '-') || ')', ' ;; ') from dry_hasil where not lulus), '-');
end
$$;`)

const dir = path.join(homedir(), '.cache', 'taskmgmt-smoke')
mkdirSync(dir, { recursive: true })
const file = path.join(dir, `dryrun-${versi.join('-')}.sql`)
writeFileSync(file, bagian.join('\n\n'))

if (process.env.DRYRUN_PRINT_ONLY) { console.log(`SQL ditulis ke ${file} (tidak dijalankan).`); process.exit(0) }

const run = spawnSync('supabase',
  ['db', 'query', `--remote=${projectRef()}`, '--yes', '--agent', 'no', '-f', file], { encoding: 'utf8' })
const text = `${run.stdout}\n${run.stderr}`
const m = text.match(/HASIL_DRYRUN total=(\d+) gagal=(\d+) :: (.*?)(?:\\n|\n|")/)
if (!m) {
  console.error(`Dry-run ${versi.join(', ')} TIDAK menghasilkan HASIL_DRYRUN.
Kemungkinan: Supabase CLI belum login ke akun pemilik project ('supabase login'),
CLI tidak terpasang, tidak ada koneksi, atau SQL error (lihat di bawah).
Tidak ada data yang berubah (transaksi tidak pernah di-commit).
Keluaran terakhir:\n${text.slice(-800)}`)
  process.exit(1)
}
const [total, gagal] = [Number(m[1]), Number(m[2])]
if (gagal) for (const f of m[3].split(' ;; ')) console.log(`  [GAGAL] ${f}`)
console.log(`Dry-run ${versi.join(', ')}: LULUS ${total - gagal}, GAGAL ${gagal} (semua di-rollback)`)
process.exit(gagal ? 1 : 0)
