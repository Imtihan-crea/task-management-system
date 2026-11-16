-- 020_profile_deleted_at.sql
-- 16 Nov 2026: hapus akun (penghapusan lunak) oleh Super Admin / Developer.
--
-- Akun yang dihapus: deleted_at terisi, status INACTIVE, login diblokir di
-- Supabase Auth (ban). Baris profil tetap ada supaya nama di riwayat task,
-- meeting, dan activity tetap terbaca. Tidak bisa diaktifkan lagi dari aplikasi.
-- Tidak ada baris data yang diubah.
-- Rollback: database/migrations/down/020_profile_deleted_at.down.sql

alter table public.profiles
  add column if not exists deleted_at timestamptz;

alter table public.profiles
  drop constraint if exists profiles_deleted_is_inactive;
alter table public.profiles
  add constraint profiles_deleted_is_inactive
  check (deleted_at is null or status = 'INACTIVE');

insert into public.app_migrations (version, name, note)
values ('020', '020_profile_deleted_at', 'profiles.deleted_at untuk hapus akun lunak')
on conflict (version) do nothing;
