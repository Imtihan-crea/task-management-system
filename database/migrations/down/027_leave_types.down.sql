-- Rollback 027: kembalikan jenis cuti tetap. Gagal bila masih ada pengajuan dengan kode
-- di luar CUTI/SAKIT/KHUSUS/TANPA_GAJI (jenis buatan HR); pindahkan atau tangani datanya dulu.
delete from public.master_references where list = 'LEAVE_TYPE';
alter table public.master_references drop constraint if exists master_references_leave_attrs_check;
alter table public.master_references drop column if exists counts_hours, drop column if exists uses_quota, drop column if exists max_days;
alter table public.master_references drop constraint if exists master_references_list_check;
alter table public.master_references add constraint master_references_list_check
  check (list in ('ACTIVITY_CATEGORY', 'WORK_LOCATION', 'DIVISION', 'POSITION', 'INTERNAL_PROJECT'));
alter table public.leave_requests drop constraint if exists leave_requests_kind_check;
alter table public.leave_requests add constraint leave_requests_kind_check
  check (kind in ('CUTI', 'SAKIT', 'KHUSUS', 'TANPA_GAJI'));
delete from public.app_migrations where version = '027';
