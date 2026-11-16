-- Rollback 019_user_permissions.sql
drop table if exists public.user_permissions;
alter table public.profiles drop constraint if exists profiles_developer_is_active_admin;
alter table public.profiles drop column if exists is_developer;
delete from public.app_migrations where version = '019';
