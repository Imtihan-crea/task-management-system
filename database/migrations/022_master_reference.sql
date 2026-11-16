-- 022_master_reference.sql
-- 16 Nov 2026: Master Reference untuk daftar pilihan HR / Daily Tracker
-- (kategori aktivitas, lokasi, divisi, jabatan, proyek internal). Aturan dari
-- FMS/IMS (ADR 0074/0076) + keputusan pemilik 16 Nov 2026:
-- - Pilihan TIDAK dihapus, hanya diarsipkan (archived_at); data lama tetap terbaca.
-- - Kode dibuat server dari label saat dibuat dan tidak pernah berubah.
-- - Label boleh diubah hanya dengan menambah (label lama wajib tetap termuat);
--   penjelasan boleh diubah. Aturannya di lib/hr/reference.ts (server action).
-- - Label unik per daftar tanpa membedakan huruf besar-kecil.
-- - Staf boleh mengetik teks bebas di tracker: teksnya tetap tersimpan di entri
--   (*_ref null) dan muncul sebagai usulan untuk dikukuhkan pemegang izin
--   reference.manage. Saat dikukuhkan, *_ref diisi; teks asli tidak diubah.
-- Isi awal = daftar dropdown sheet Daily Tracker (tanpa data karyawan).
-- work_logs masih kosong di produksi saat migrasi ini dibuat.
-- Rollback: database/migrations/down/022_master_reference.down.sql

create table if not exists public.master_references (
  id uuid primary key default gen_random_uuid(),
  list text not null check (list in ('ACTIVITY_CATEGORY', 'WORK_LOCATION', 'DIVISION', 'POSITION', 'INTERNAL_PROJECT')),
  code text not null check (code ~ '^[A-Z0-9_]{1,60}$'),
  label text not null check (char_length(label) between 1 and 80),
  description text check (description is null or char_length(description) <= 500),
  sort_order integer not null default 0,
  archived_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (list, code)
);

create unique index if not exists master_references_label_unique
  on public.master_references (list, lower(label));

alter table public.master_references enable row level security;
revoke all on public.master_references from anon, authenticated;
grant select on public.master_references to authenticated;
drop policy if exists "Active users read master references" on public.master_references;
create policy "Active users read master references" on public.master_references
  for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.status = 'ACTIVE'));

-- Tautan entri tracker ke pilihan master; null = teks bebas (lihat kolom teksnya).
alter table public.work_logs
  add column if not exists category_ref uuid references public.master_references(id),
  add column if not exists location_ref uuid references public.master_references(id),
  add column if not exists internal_project_ref uuid references public.master_references(id);

alter table public.work_logs drop constraint if exists work_logs_one_project_source;
alter table public.work_logs add constraint work_logs_one_project_source
  check (project_id is null or internal_project_ref is null);

create index if not exists work_logs_free_category on public.work_logs (lower(category)) where category_ref is null;
create index if not exists work_logs_free_location on public.work_logs (lower(location)) where location_ref is null;
create index if not exists work_logs_free_project on public.work_logs (lower(project_name)) where project_id is null and internal_project_ref is null;

insert into public.master_references (list, code, label, sort_order) values
  ('ACTIVITY_CATEGORY', 'FOCUS_WORK', 'Focus Work', 10),
  ('ACTIVITY_CATEGORY', 'MEETING', 'Meeting', 20),
  ('ACTIVITY_CATEGORY', 'KOORDINASI', 'Koordinasi', 30),
  ('ACTIVITY_CATEGORY', 'ADMINISTRASI', 'Administrasi', 40),
  ('ACTIVITY_CATEGORY', 'MONITORING_SUPERVISI', 'Monitoring/Supervisi', 50),
  ('ACTIVITY_CATEGORY', 'PRODUKSI_IMPLEMENTASI', 'Produksi/Implementasi', 60),
  ('ACTIVITY_CATEGORY', 'PLANNING', 'Planning', 70),
  ('ACTIVITY_CATEGORY', 'RISET_LEARNING', 'Riset/Learning', 80),
  ('ACTIVITY_CATEGORY', 'PERJALANAN', 'Perjalanan', 90),
  ('ACTIVITY_CATEGORY', 'BREAK_PERSONAL', 'Break/Personal', 100),
  ('WORK_LOCATION', 'KANTOR_PASTEUR', 'Kantor Pasteur', 10),
  ('WORK_LOCATION', 'KANTOR_CLIENT', 'Kantor Client', 20),
  ('WORK_LOCATION', 'PERJALANAN', 'Perjalanan', 30),
  ('WORK_LOCATION', 'RUMAH', 'Rumah', 40),
  ('WORK_LOCATION', 'WFA', 'WFA', 50),
  ('WORK_LOCATION', 'INSPEK_VENDOR', 'Inspek Vendor', 60),
  ('WORK_LOCATION', 'INSPEK_SUPPLIER', 'Inspek Supplier', 70),
  ('DIVISION', 'OPERATION', 'Operation', 10),
  ('DIVISION', 'FAT', 'FAT', 20),
  ('DIVISION', 'HR', 'HR', 30),
  ('DIVISION', 'MARKETING', 'Marketing', 40),
  ('POSITION', 'CEO', 'CEO', 10),
  ('POSITION', 'COO', 'COO', 20),
  ('INTERNAL_PROJECT', 'MANAJEMEN_PERUSAHAAN', 'Manajemen Perusahaan', 10),
  ('INTERNAL_PROJECT', 'POTENSIAL', 'Potensial', 20)
on conflict (list, code) do nothing;

insert into public.app_migrations (version, name, note)
values ('022', '022_master_reference', 'master_references + tautan work_logs ke pilihan master (teks bebas = ref null)')
on conflict (version) do nothing;
