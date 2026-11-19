-- Rollback 026: kembalikan pilihan IZIN. Data IZIN lama TIDAK bisa dipulihkan otomatis
-- (lihat activity/riwayat bila perlu). KHUSUS dan TANPA_GAJI dijadikan IZIN.
alter table public.leave_requests drop constraint if exists leave_requests_special_reason_check;
alter table public.leave_requests drop constraint if exists leave_requests_kind_check;
update public.leave_requests set kind = 'IZIN' where kind in ('KHUSUS', 'TANPA_GAJI');
alter table public.leave_requests add constraint leave_requests_kind_check check (kind in ('CUTI', 'IZIN', 'SAKIT'));
alter table public.leave_requests drop column if exists special_reason;
delete from public.app_migrations where version = '026';
