-- 032_task_transfers.sql
-- 20 Nov 2026: alih task ke consultant lain (keputusan pemilik). Dua jenis:
--   PERMANENT  assignee pindah saat disetujui;
--   TEMPORARY  assignee pindah selama rentang starts_at..ends_at (menit s/d bulan).
-- Consultant mengajukan untuk task miliknya, PM/Admin (pemegang tasks.edit di project)
-- menyetujui; PM/Admin juga boleh langsung mengalihkan. Saat masa sementara habis:
-- auto_return = kembali otomatis ke pemilik asal; selain itu PM ditanya (EXPIRED) dan
-- task tetap pada pemegang terakhir sampai PM memilih.
-- leave_request_id: alih task yang dibuat dari pengajuan cuti/sakit (Fase 3).
-- Status: PENDING (menunggu PM) -> SCHEDULED (sementara, belum mulai) -> ACTIVE ->
--   EXPIRED (masa habis, menunggu PM) -> DONE; atau REJECTED / CANCELLED.
-- Sengaja TANPA check from_user_id <> to_user_id: merge_user_into (030) menulis ulang
-- semua kolom FK ke profiles dan check itu akan menggagalkan gabung akun. Validasi di server.
-- Tulis hanya lewat server (service role); user membaca alih task yang melibatkannya.
-- Nomor 032: 031 dipakai cabang rilis (Guest).
-- Rollback: database/migrations/down/032_task_transfers.down.sql

create table if not exists public.task_transfers (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  from_user_id uuid not null references public.profiles(id) on delete cascade,
  to_user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('PERMANENT', 'TEMPORARY')),
  starts_at timestamptz,
  ends_at timestamptz,
  auto_return boolean not null default false,
  status text not null default 'PENDING'
    check (status in ('PENDING', 'SCHEDULED', 'ACTIVE', 'EXPIRED', 'DONE', 'REJECTED', 'CANCELLED')),
  requested_by uuid references public.profiles(id) on delete set null,
  note text check (note is null or char_length(note) <= 1000),
  decided_by uuid references public.profiles(id) on delete set null,
  decided_at timestamptz,
  decision_note text check (decision_note is null or char_length(decision_note) <= 1000),
  leave_request_id uuid references public.leave_requests(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint task_transfers_range check (
    kind = 'PERMANENT' or (starts_at is not null and ends_at is not null and ends_at > starts_at)
  )
);

-- Satu task hanya punya satu alih task yang masih berjalan.
create unique index if not exists task_transfers_one_open
  on public.task_transfers (task_id)
  where status in ('PENDING', 'SCHEDULED', 'ACTIVE', 'EXPIRED');
-- Penjadwal 5 menit: cari yang perlu dimulai / diakhiri.
create index if not exists task_transfers_due on public.task_transfers (status, starts_at, ends_at);
create index if not exists task_transfers_to_user on public.task_transfers (to_user_id, status);
create index if not exists task_transfers_from_user on public.task_transfers (from_user_id, status);

alter table public.task_transfers enable row level security;
revoke all on public.task_transfers from anon, authenticated;
grant select on public.task_transfers to authenticated;
drop policy if exists "Users read own transfers" on public.task_transfers;
create policy "Users read own transfers" on public.task_transfers
  for select to authenticated
  using (from_user_id = (select auth.uid()) or to_user_id = (select auth.uid()) or requested_by = (select auth.uid()));

insert into public.app_migrations (version, name, note)
values ('032', '032_task_transfers', 'tabel task_transfers (alih task permanen/sementara)')
on conflict (version) do nothing;
