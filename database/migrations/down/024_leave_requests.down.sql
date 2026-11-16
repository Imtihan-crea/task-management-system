-- Rollback 024_leave_requests.sql (MENGHAPUS semua data cuti; backup dulu)
drop table if exists public.leave_requests;
delete from public.app_migrations where version = '024';
