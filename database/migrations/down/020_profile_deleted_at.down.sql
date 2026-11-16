-- Rollback 020_profile_deleted_at.sql
alter table public.profiles drop constraint if exists profiles_deleted_is_inactive;
alter table public.profiles drop column if exists deleted_at;
delete from public.app_migrations where version = '020';
