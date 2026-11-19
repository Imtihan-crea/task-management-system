-- 027_leave_types.sql
-- 19 Nov 2026: jenis cuti diatur HR di Master Reference (daftar LEAVE_TYPE), bukan lagi
-- hardcoded. Atribut per jenis (hanya terisi untuk list LEAVE_TYPE):
--   counts_hours  hari cuti disetujui dihitung jam kerja (jam/hari ditambahkan ke jam kerja)
--   uses_quota    hari cuti disetujui memotong jatah cuti tahunan
--   max_days      batas hari kerja per pengajuan (null = tanpa batas khusus)
-- Kolom terpisah (bukan jsonb) supaya bisa diberi check dan terbaca langsung.
-- Isi awal = empat jenis dari migrasi 026 dengan kode yang sama. Data leave_requests tidak diubah.
-- Urutan rilis: migrasi ini HARUS diterapkan sebelum kode barunya.
-- Rollback: database/migrations/down/027_leave_types.down.sql

alter table public.master_references
  add column if not exists counts_hours boolean,
  add column if not exists uses_quota boolean,
  add column if not exists max_days smallint;

alter table public.master_references drop constraint if exists master_references_list_check;
alter table public.master_references add constraint master_references_list_check
  check (list in ('ACTIVITY_CATEGORY', 'WORK_LOCATION', 'DIVISION', 'POSITION', 'INTERNAL_PROJECT', 'LEAVE_TYPE'));

alter table public.master_references drop constraint if exists master_references_leave_attrs_check;
alter table public.master_references add constraint master_references_leave_attrs_check
  check (
    (list = 'LEAVE_TYPE' and counts_hours is not null and uses_quota is not null and (max_days is null or max_days between 1 and 366))
    or (list <> 'LEAVE_TYPE' and counts_hours is null and uses_quota is null and max_days is null)
  );

-- leave_requests.kind kini berisi kode dari master (bisa bertambah), bukan daftar tetap.
alter table public.leave_requests drop constraint if exists leave_requests_kind_check;
alter table public.leave_requests add constraint leave_requests_kind_check
  check (kind ~ '^[A-Z0-9_]{1,60}$');

insert into public.master_references (list, code, label, sort_order, counts_hours, uses_quota) values
  ('LEAVE_TYPE', 'CUTI', 'Cuti Tahunan', 10, true, true),
  ('LEAVE_TYPE', 'SAKIT', 'Cuti Sakit', 20, true, false),
  ('LEAVE_TYPE', 'KHUSUS', 'Cuti Khusus', 30, true, false),
  ('LEAVE_TYPE', 'TANPA_GAJI', 'Cuti di Luar Tanggungan', 40, false, false)
on conflict (list, code) do nothing;

insert into public.app_migrations (version, name, note)
values ('027', '027_leave_types', 'jenis cuti jadi daftar LEAVE_TYPE di master_references (atribut counts_hours, uses_quota, max_days)')
on conflict (version) do nothing;
