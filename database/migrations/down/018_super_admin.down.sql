-- Rollback 018_super_admin.sql
alter table public.profiles drop constraint if exists profiles_super_admin_is_active_admin;
alter table public.profiles drop column if exists is_super_admin;
delete from public.app_migrations where version = '018';
