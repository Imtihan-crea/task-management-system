-- Rollback 023_tracker_required.sql
alter table public.profiles drop column if exists tracker_required;
delete from public.app_migrations where version = '023';
