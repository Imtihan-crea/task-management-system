-- Rollback 017: kembali ke default lpad lama (memotong angka di atas lebar).
-- Urutan task_code_seq tidak dikembalikan (nilai lamanya tidak tercatat).
alter table public.tasks
  alter column code set default ('T-' || lpad(nextval('public.task_code_seq')::text, 2, '0'));
alter table public.task_suggestions
  alter column code set default ('S-' || lpad(nextval('public.suggestion_code_seq')::text, 3, '0'));
alter table public.meetings
  alter column code set default ('M-' || lpad(nextval('public.meeting_code_seq')::text, 3, '0'));
alter table public.projects
  alter column code set default lpad(nextval('public.project_code_seq')::text, 3, '0');
drop function if exists public.next_code(text, regclass, int);
delete from public.app_migrations where version = '017';
