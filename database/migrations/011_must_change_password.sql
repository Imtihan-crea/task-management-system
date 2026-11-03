-- 011_must_change_password.sql
-- 3 Nov 2026: admin bisa membuat user langsung dengan email + password
-- (tanpa link invite). Checkbox opsional "Require password change on
-- first login" disimpan di kolom ini.
--
-- ADDITIVE ONLY: satu kolom boolean NOT NULL DEFAULT false.
-- Tidak ada data yang diubah.

alter table public.profiles
  add column if not exists must_change_password boolean not null default false;
