-- 017_code_no_truncate.sql
-- 9 Nov 2026 (DARURAT): Task baru gagal dibuat di produksi dengan
-- "duplicate key value violates unique constraint tasks_code_unique".
--
-- Penyebab: default kode memakai lpad(nextval(...)::text, 2, '0'). lpad
-- MEMOTONG teks yang lebih panjang dari lebarnya: lpad('123', 2, '0') = '12'.
-- Setelah task_code_seq melewati 99 (banyak task uji dibuat lalu dihapus),
-- angka 100–159 menjadi T-10 … T-15, yang sudah dipakai task nyata, sehingga
-- hampir setiap insert bentrok. Project/Suggestion/Meeting (lebar 3) punya
-- masalah yang sama begitu urutannya melewati 999.
--
-- Perbaikan:
-- 1. Fungsi public.next_code(prefix, seq, width): lebar minimum, tidak pernah
--    memotong (T-09, T-99, T-100, T-1234).
-- 2. Default kode keempat tabel memakai fungsi itu.
-- 3. task_code_seq dikembalikan ke nomor Task terbesar yang ada, supaya
--    penomoran lanjut dari T-16 (bukan T-17x). Aman: unique constraint tetap
--    menjaga, dan tidak ada kode Task 3 digit di data.
-- Tidak ada baris data yang diubah.
-- Rollback: database/migrations/down/017_code_no_truncate.down.sql
--
-- Status: BELUM dijalankan. Jalankan seluruh file di SQL Editor Supabase
-- (tidak bergantung pada 016). Cek: buat satu Task lewat aplikasi; kodenya
-- harus nomor berikutnya setelah Task terbesar (mis. T-16).

create or replace function public.next_code(prefix text, seq regclass, width int)
returns text
language sql
volatile
set search_path = public as $$
  select prefix || lpad(n::text, greatest(width, length(n::text)), '0')
  from (select nextval(seq) as n) s;
$$;

-- Dipanggil default kolom saat insert; insert hanya lewat service role.
revoke all on function public.next_code(text, regclass, int) from public, anon, authenticated;
grant execute on function public.next_code(text, regclass, int) to service_role;

alter table public.tasks
  alter column code set default public.next_code('T-', 'public.task_code_seq', 2);
alter table public.task_suggestions
  alter column code set default public.next_code('S-', 'public.suggestion_code_seq', 3);
alter table public.meetings
  alter column code set default public.next_code('M-', 'public.meeting_code_seq', 3);
alter table public.projects
  alter column code set default public.next_code('', 'public.project_code_seq', 3);

select setval('public.task_code_seq',
  -- Hanya kode T-<angka>: kode lain (mis. sisa data uji) tidak boleh membatalkan migrasi.
  greatest(coalesce((select max(substring(code from 3)::integer) from public.tasks where code ~ '^T-[0-9]+$'), 0), 1),
  (select count(*) > 0 from public.tasks where code ~ '^T-[0-9]+$'));

insert into public.app_migrations (version, name, note)
values ('017', '017_code_no_truncate', 'kode tidak lagi terpotong lpad; task_code_seq ke nomor terbesar')
on conflict (version) do nothing;
