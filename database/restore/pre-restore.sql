-- Jalankan di project Supabase BARU sebelum roles.sql/schema.sql (lihat docs/backup.md).
-- Project baru memberi anon/authenticated/service_role hak penuh otomatis atas
-- objek baru di schema public (default privileges). schema.sql hanya berisi
-- GRANT yang ada di produksi, jadi hak berlebih itu tidak pernah dicabut.
-- Dicabut sementara di sini; post-restore.sql mengembalikannya.
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated, service_role;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated, service_role;
alter default privileges for role postgres in schema public revoke all on functions from anon, authenticated, service_role;
