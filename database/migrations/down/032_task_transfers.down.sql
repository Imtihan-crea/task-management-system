-- Rollback 032: hapus tabel alih task. Assignee task yang sudah dialihkan TIDAK dikembalikan.
drop table if exists public.task_transfers;
delete from public.app_migrations where version = '032';
