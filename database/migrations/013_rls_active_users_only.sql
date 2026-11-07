-- 013_rls_active_users_only.sql
-- 7 Nov 2026: user yang tidak ACTIVE (INVITED / INACTIVE) tidak boleh membaca
-- data lewat Supabase API langsung (anon key + JWT miliknya).
--
-- Masalah lama: policy SELECT di projects, tasks, workstreams, dst. hanya
-- memeriksa "authenticated", bukan status. Proxy aplikasi memang menendang
-- user INACTIVE, tetapi PostgREST bisa dipanggil langsung tanpa lewat proxy.
-- Token yang masih berlaku setelah user dinonaktifkan juga tetap bisa dipakai.
--
-- Perbaikan: satu policy RESTRICTIVE per tabel. Policy restrictive di-AND-kan
-- dengan policy yang sudah ada, jadi policy lama tidak perlu ditulis ulang.
-- Status dicek per request, sehingga user yang baru dinonaktifkan langsung
-- kehilangan akses walau token-nya belum kedaluwarsa.
--
-- Pengecualian: profiles baris milik sendiri tetap terbaca (proxy, sesi, dan
-- /accept-invite membaca profil sendiri saat status INVITED).
-- Service role (server actions, cron) mem-bypass RLS, jadi tidak terpengaruh.
--
-- Tidak ada data yang diubah.
-- Rollback: drop policy "Only active users" di tiap tabel di bawah, lalu
--           drop function public.is_active_user().
--
-- Status: SUDAH dijalankan di produksi 7 Nov 2026 ±15:54 WIB (supabase db query).
-- Uji sebelum apply (transaksi di-rollback): user ACTIVE melihat projects=5
-- tasks=9; user yang sama saat INACTIVE/INVITED melihat 0, profil sendiri tetap 1.

create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and status = 'ACTIVE'
  );
$$;

revoke all on function public.is_active_user() from public, anon;
grant execute on function public.is_active_user() to authenticated;

do $$
declare
  t text;
begin
  foreach t in array array[
    'activity_logs', 'meeting_action_items', 'meeting_agendas',
    'meeting_decisions', 'meeting_participants', 'meetings',
    'notification_events', 'notification_preferences', 'notifications',
    'project_managers', 'projects', 'task_suggestions', 'tasks', 'workstreams'
  ] loop
    execute format('drop policy if exists "Only active users" on public.%I', t);
    execute format(
      'create policy "Only active users" on public.%I as restrictive '
      'for all to authenticated '
      'using (public.is_active_user()) with check (public.is_active_user())',
      t
    );
  end loop;
end
$$;

drop policy if exists "Only active users" on public.profiles;
create policy "Only active users" on public.profiles as restrictive
  for all to authenticated
  using (id = auth.uid() or public.is_active_user())
  with check (id = auth.uid() or public.is_active_user());
