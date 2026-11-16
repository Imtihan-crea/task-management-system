-- 024_leave_requests.sql
-- 16 Nov 2026: HR Tahap 2 — cuti / izin / sakit (pengganti "Leave Form" sheet).
-- Karyawan mengajukan sendiri; pemegang izin leave.approve (atau hr.manage)
-- menyetujui/menolak. `days` = jumlah hari kerja (kalender) saat diajukan.
-- Saldo cuti tahunan = profiles.annual_leave_quota − hari CUTI disetujui tahun berjalan.
-- Tulis hanya lewat server action (service role); user biasa membaca miliknya.
-- Tidak ada baris data yang diubah.
-- Rollback: database/migrations/down/024_leave_requests.down.sql

create table if not exists public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('CUTI', 'IZIN', 'SAKIT')),
  start_date date not null,
  end_date date not null,
  days smallint not null check (days between 0 and 366),
  reason text check (reason is null or char_length(reason) <= 1000),
  attachment_url text check (attachment_url is null or char_length(attachment_url) <= 2000),
  status text not null default 'PENDING' check (status in ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED')),
  decided_by uuid references public.profiles(id) on delete set null,
  decided_at timestamptz,
  decision_note text check (decision_note is null or char_length(decision_note) <= 1000),
  source text not null default 'APP' check (source in ('APP', 'IMPORT')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint leave_requests_range check (end_date >= start_date)
);

create index if not exists leave_requests_user_dates on public.leave_requests (user_id, start_date, end_date);
create index if not exists leave_requests_status on public.leave_requests (status, start_date);

alter table public.leave_requests enable row level security;
revoke all on public.leave_requests from anon, authenticated;
grant select on public.leave_requests to authenticated;
drop policy if exists "Users read own leave" on public.leave_requests;
create policy "Users read own leave" on public.leave_requests
  for select to authenticated using (user_id = auth.uid());

insert into public.app_migrations (version, name, note)
values ('024', '024_leave_requests', 'tabel leave_requests (cuti/izin/sakit)')
on conflict (version) do nothing;
