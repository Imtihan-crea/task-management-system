-- Rollback 022_master_reference.sql (teks bebas di work_logs tetap; tautan ke master hilang)
alter table public.work_logs drop constraint if exists work_logs_one_project_source;
drop index if exists public.work_logs_free_category;
drop index if exists public.work_logs_free_location;
drop index if exists public.work_logs_free_project;
alter table public.work_logs
  drop column if exists category_ref,
  drop column if exists location_ref,
  drop column if exists internal_project_ref;
drop table if exists public.master_references;
delete from public.app_migrations where version = '022';
