-- Rollback 028: backup email kembali gagal (RPC hilang) sampai lib/backup diubah.
drop function if exists public.backup_auth_export();
drop function if exists public.backup_db_config();
delete from public.app_migrations where version = '028';
