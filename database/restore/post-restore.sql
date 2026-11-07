-- Jalankan sesudah data.sql (lihat docs/backup.md).
-- 1. Kembalikan default privileges seperti project Supabase standar/produksi
--    (dicek 7 Nov 2026), supaya migrasi berikutnya berperilaku sama.
alter default privileges for role postgres in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on functions to anon, authenticated, service_role;

-- 2. Trigger di auth.users tidak ikut dump (schema auth milik platform).
--    Tanpa ini user baru (undangan/admin) tidak mendapat profil.
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
