-- 023_tracker_required.sql
-- 16 Nov 2026: penanda "wajib isi Daily Tracker" per karyawan (keputusan pemilik:
-- pengingat sore hanya untuk yang wajib). Diubah pemegang izin hr.manage di
-- data karyawan (detail user).
-- Data: nilai awal true untuk user yang sudah punya entri tracker (histori
-- yang diimport dari sheet Daily Tracker + entri aplikasi).
-- Rollback: database/migrations/down/023_tracker_required.down.sql

alter table public.profiles
  add column if not exists tracker_required boolean not null default false;

update public.profiles p
set tracker_required = true
where exists (select 1 from public.work_logs w where w.user_id = p.id)
  and p.deleted_at is null;

insert into public.app_migrations (version, name, note)
values ('023', '023_tracker_required', 'profiles.tracker_required; awal true untuk user yang punya entri tracker')
on conflict (version) do nothing;
