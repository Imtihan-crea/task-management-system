-- 016_rls_scoped_reads.sql
-- 9 Nov 2026: baca lewat Supabase API langsung (anon key + JWT user) dibatasi
-- sesuai aturan aplikasi. Usulan dari docs/review-rls.md, disetujui pemilik
-- untuk disiapkan (keputusan audit bagian I butir 6).
--
-- Masalah lama: policy SELECT tasks/projects/workstreams = "semua user ACTIVE".
-- TEAM_MEMBER bisa membaca seluruh task lewat GET /rest/v1/tasks walau UI
-- menyembunyikannya. Aplikasi membaca tabel ini lewat service role, jadi
-- perubahan ini tidak mengubah perilaku aplikasi.
--
-- Cakupan baru (sama dengan aplikasi; keputusan pemilik: VIEWER dan PM tetap
-- boleh melihat semua project):
--   tasks       ADMIN/VIEWER semua; PM task di project yang ia kelola; siapa pun
--               task yang di-assign kepadanya.
--   projects    ADMIN/VIEWER/PM semua; TEAM_MEMBER project tempat ia punya task.
--   workstreams ikut project yang terbaca.
-- Plus: cabut EXECUTE fungsi SECURITY DEFINER yang tidak perlu dan grant
-- berlebih (TRUNCATE/REFERENCES/TRIGGER, INSERT/DELETE profiles).
-- project_managers tetap terbaca semua user ACTIVE (dipakai subquery policy).
--
-- Tidak ada data yang diubah.
-- Rollback: database/migrations/down/016_rls_scoped_reads.down.sql
--
-- Status: BELUM dijalankan. Cara uji: jalankan file ini di SQL Editor, lalu
-- npm run test:rls (34 cek) dan npm run e2e:rbac. Bila gagal, jalankan file down.

create or replace function public.current_role_active()
returns text
language sql
stable
security definer
set search_path = public as $$
  select role from public.profiles where id = auth.uid() and status = 'ACTIVE';
$$;

revoke all on function public.current_role_active() from public, anon;
grant execute on function public.current_role_active() to authenticated;

drop policy if exists "Authenticated can view active tasks" on public.tasks;
drop policy if exists "Tasks readable by scope" on public.tasks;
create policy "Tasks readable by scope"
  on public.tasks for select
  to authenticated
  using (
    is_deleted = false and (
      assignee_id = auth.uid()
      or public.current_role_active() in ('ADMIN', 'VIEWER')
      or exists (
        select 1 from public.project_managers pm
        where pm.project_id = tasks.project_id and pm.user_id = auth.uid()
      )
    )
  );

-- Subquery ke tasks memakai RLS tasks milik pemanggil; tidak rekursif karena
-- policy tasks tidak membaca projects.
drop policy if exists "Authenticated can view projects" on public.projects;
drop policy if exists "Projects readable by scope" on public.projects;
create policy "Projects readable by scope"
  on public.projects for select
  to authenticated
  using (
    public.current_role_active() in ('ADMIN', 'VIEWER', 'PROJECT_MANAGER')
    or exists (
      select 1 from public.tasks t
      where t.project_id = projects.id and t.assignee_id = auth.uid() and t.is_deleted = false
    )
  );

drop policy if exists "Authenticated can view workstreams" on public.workstreams;
drop policy if exists "Workstreams readable by scope" on public.workstreams;
create policy "Workstreams readable by scope"
  on public.workstreams for select
  to authenticated
  using (exists (select 1 from public.projects p where p.id = workstreams.project_id));

-- count_active_admins tidak dipakai kode mana pun; anon bisa memanggilnya lewat RPC.
revoke all on function public.count_active_admins(uuid) from public, anon, authenticated;
-- is_admin dipakai policy profiles (to authenticated), anon tidak perlu.
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

revoke truncate, references, trigger on all tables in schema public from anon, authenticated;
revoke insert, delete on public.profiles from anon, authenticated;

insert into public.app_migrations (version, name, note)
values ('016', '016_rls_scoped_reads', 'baca tasks/projects/workstreams dibatasi per peran')
on conflict (version) do nothing;
