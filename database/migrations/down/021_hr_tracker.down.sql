-- Rollback 021_hr_tracker.sql (MENGHAPUS semua data tracker; backup dulu)
drop table if exists public.work_log_comments;
drop table if exists public.work_logs;
drop table if exists public.hr_month_targets;
drop table if exists public.work_calendar;
drop table if exists public.hr_settings;
alter table public.profiles
  drop column if exists division,
  drop column if exists position_title,
  drop column if exists position_level,
  drop column if exists join_date,
  drop column if exists annual_leave_quota;
delete from public.app_migrations where version = '021';
