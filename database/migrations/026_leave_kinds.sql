-- 026_leave_kinds.sql
-- 19 Nov 2026: jenis cuti diganti (keputusan pemilik, mengikuti UU 13/2003 jo. UU 6/2023
-- dan UU 4/2024 KIA): CUTI (Cuti Tahunan), SAKIT (Cuti Sakit), KHUSUS (Cuti Khusus,
-- wajib alasan di special_reason), TANPA_GAJI (Cuti di Luar Tanggungan). IZIN dihapus.
-- Data diubah: pengajuan IZIN lama dipindah. Alasan berbau medis -> SAKIT, selainnya
-- -> CUTI (izin pribadi memotong cuti tahunan, praktik umum perusahaan).
-- Rollback: database/migrations/down/026_leave_kinds.down.sql

alter table public.leave_requests add column if not exists special_reason text;

update public.leave_requests
set kind = case
    when reason ~* '(sakit|dokter|operasi|rawat|klinik|rumah sakit|gigi)' then 'SAKIT'
    else 'CUTI'
  end,
  updated_at = now()
where kind = 'IZIN';

alter table public.leave_requests drop constraint if exists leave_requests_kind_check;
alter table public.leave_requests add constraint leave_requests_kind_check
  check (kind in ('CUTI', 'SAKIT', 'KHUSUS', 'TANPA_GAJI'));
alter table public.leave_requests drop constraint if exists leave_requests_special_reason_check;
alter table public.leave_requests add constraint leave_requests_special_reason_check
  check (
    (kind = 'KHUSUS' and special_reason is not null and char_length(special_reason) <= 40)
    or (kind <> 'KHUSUS' and special_reason is null)
  );

insert into public.app_migrations (version, name, note)
values ('026', '026_leave_kinds', 'jenis cuti: Cuti Tahunan, Sakit, Khusus, di Luar Tanggungan; IZIN dipindah')
on conflict (version) do nothing;
