-- Rollback 032: hapus tabel alih task. Assignee task yang sudah dialihkan TIDAK dikembalikan.
drop table if exists public.task_transfers;
delete from public.master_references where list = 'TRANSFER_DURATION';
alter table public.master_references drop constraint if exists master_references_list_check;
alter table public.master_references add constraint master_references_list_check
  check (list in ('ACTIVITY_CATEGORY', 'WORK_LOCATION', 'DIVISION', 'POSITION', 'INTERNAL_PROJECT', 'LEAVE_TYPE'));
delete from public.app_migrations where version = '032';
