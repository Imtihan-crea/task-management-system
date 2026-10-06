-- 010_task_canceled.sql
-- Phase 11 update (7 Okt 2026): status CANCELED + tanggal submit.
-- ADDITIVE ONLY: melonggarkan CHECK status, menambah 2 kolom nullable.
-- Tidak ada data yang diubah kecuali backfill completed_at untuk task DONE
-- yang sudah ada (diambil dari updated_at = waktu perubahan terakhir,
-- yang untuk task DONE hampir selalu momen penanda-selesai).

-- 1. Status CANCELED diizinkan.
alter table public.tasks
  drop constraint if exists tasks_status_check;
alter table public.tasks
  add constraint tasks_status_check check (
    status in ('TODO', 'IN_PROGRESS', 'REVIEW', 'BLOCKED', 'DONE', 'CANCELLED')
  );

-- 2. Tanggal submit: kapan task DONE / CANCELED (diisi tombol submit,
--    bukan dropdown — lihat app/actions/tasks.ts submitTask/cancelTask).
alter table public.tasks
  add column if not exists completed_at timestamptz;
alter table public.tasks
  add column if not exists cancelled_at timestamptz;

-- 3. Backfill task DONE lama (sebelum kolom ini ada).
update public.tasks
set completed_at = updated_at
where status = 'DONE' and completed_at is null;
