-- Rollback 028: backup email kembali gagal (RPC hilang) sampai lib/backup diubah.
drop function if exists public.backup_auth_export();
delete from public.app_migrations where version = '028';
