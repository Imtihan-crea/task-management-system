-- 018_super_admin.sql
-- 16 Nov 2026: penanda Super Admin (permintaan pemilik: CEO paling tinggi).
--
-- Super Admin tetap role ADMIN (semua izin & RLS lama tidak berubah); bedanya
-- di aplikasi: hanya Super Admin yang boleh mengubah/menonaktifkan/mereset
-- Admin lain dan menjadikan user Admin, dan Super Admin tidak bisa diturunkan
-- atau dinonaktifkan (lihat lib/auth/super-admin.ts).
-- User biasa hanya punya hak UPDATE kolom full_name, jadi kolom ini tidak bisa
-- diubah sendiri lewat API.
-- Tidak ada baris data yang diubah; Super Admin ditetapkan terpisah oleh pemilik.
-- Rollback: database/migrations/down/018_super_admin.down.sql
--
-- Status: SUDAH dijalankan di produksi 16 Nov 2026 (satu transaksi, sesudah
-- dry-run dengan rollback). Super Admin pertama: Naufal Maulana.

alter table public.profiles
  add column if not exists is_super_admin boolean not null default false;

alter table public.profiles
  drop constraint if exists profiles_super_admin_is_active_admin;
alter table public.profiles
  add constraint profiles_super_admin_is_active_admin
  check (not is_super_admin or (role = 'ADMIN' and status = 'ACTIVE'));

insert into public.app_migrations (version, name, note)
values ('018', '018_super_admin', 'kolom profiles.is_super_admin + check harus ADMIN aktif')
on conflict (version) do nothing;
