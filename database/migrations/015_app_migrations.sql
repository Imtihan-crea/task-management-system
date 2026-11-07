-- 015_app_migrations.sql
-- 7 Nov 2026: catatan migrasi yang sudah jalan di database ini.
-- Nama app_migrations (bukan schema_migrations) supaya tidak tertukar dengan
-- tabel bawaan Supabase CLI supabase_migrations.schema_migrations.
--
-- Masalah lama: tidak ada catatan di database migrasi mana yang sudah
-- dijalankan. Produksi pernah tertinggal skema (fallback 42703 untuk
-- must_change_password di lib/auth/session.ts).
--
-- Tabel ini hanya untuk service role / SQL Editor: RLS aktif tanpa policy,
-- dan hak anon/authenticated dicabut.
--
-- Backfill 001–014: diverifikasi 7 Nov 2026 dengan memeriksa objek yang
-- dibuat tiap migrasi di produksi (tabel, kolom, fungsi, policy).
-- Rollback: database/migrations/down/015_app_migrations.down.sql
--
-- Status: SUDAH dijalankan di produksi 7 Nov 2026 ±17:19 WIB. Uji sebelumnya
-- (transaksi di-rollback): 15 baris, anon tanpa akses; file down 011–015 masing-
-- masing membatalkan migrasinya. Sesudah apply: npm run db:status = SINKRON.

create table if not exists public.app_migrations (
  version text primary key,
  name text not null,
  applied_at timestamptz not null default now(),
  note text
);

alter table public.app_migrations enable row level security;
revoke all on public.app_migrations from anon, authenticated;

insert into public.app_migrations (version, name, note) values
  ('001', '001_create_profiles', 'backfill: objek diverifikasi 2026-11-07'),
  ('002', '002_user_management', 'backfill: objek diverifikasi 2026-11-07'),
  ('003', '003_projects_workstreams_tasks', 'backfill: objek diverifikasi 2026-11-07'),
  ('004', '004_multi_pm_and_evidence', 'backfill: objek diverifikasi 2026-11-07'),
  ('005', '005_human_readable_codes', 'backfill: objek diverifikasi 2026-11-07'),
  ('006', '006_suggestions_notifications', 'backfill: objek diverifikasi 2026-11-07'),
  ('007', '007_activity_logs', 'backfill: objek diverifikasi 2026-11-07'),
  ('008', '008_meetings', 'backfill: objek diverifikasi 2026-11-07'),
  ('009', '009_digest_prefs', 'backfill: objek diverifikasi 2026-11-07'),
  ('010', '010_task_canceled', 'backfill: objek diverifikasi 2026-11-07'),
  ('011', '011_must_change_password', 'backfill: objek diverifikasi 2026-11-07'),
  ('012', '012_secure_handle_new_user', 'backfill: objek diverifikasi 2026-11-07'),
  ('013', '013_rls_active_users_only', 'backfill: objek diverifikasi 2026-11-07'),
  ('014', '014_set_project_managers_rpc', 'backfill: objek diverifikasi 2026-11-07'),
  ('015', '015_app_migrations', null)
on conflict (version) do nothing;
