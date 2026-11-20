-- 031_rls_guest_own_only.sql
-- 19 Nov 2026: bagan wewenang Kasuat (COA). VIEWER (label "Guest") adalah pihak luar,
-- jadi hanya membaca task dan project miliknya, sama dengan aplikasi
-- (lib/auth/roles.ts seesOwnProjectsOnly). Migrasi 016 masih memberi VIEWER baca semua
-- lewat Supabase API langsung.
--
-- Cakupan baru:
--   tasks     ADMIN semua; PM task di project yang ia kelola; siapa pun task yang
--             di-assign kepadanya. (VIEWER dikeluarkan dari "semua".)
--   projects  ADMIN/PM semua; TEAM_MEMBER dan VIEWER project tempat ia punya task.
--   workstreams tetap ikut project yang terbaca (policy 016, tidak diubah).
-- Aplikasi membaca lewat service role, jadi perilaku aplikasi tidak berubah karena file ini.
-- Tidak ada data yang diubah.
-- Rollback: database/migrations/down/031_rls_guest_own_only.down.sql
-- Status: BELUM dijalankan di produksi.
-- Nomor 031 (20 Nov 2026): 029 dan 030 sudah dipakai di produksi (cabut sesi, gabung akun).

drop policy if exists "Tasks readable by scope" on public.tasks;
create policy "Tasks readable by scope"
  on public.tasks for select
  to authenticated
  using (
    is_deleted = false and (
      assignee_id = auth.uid()
      or public.current_role_active() = 'ADMIN'
      or exists (
        select 1 from public.project_managers pm
        where pm.project_id = tasks.project_id and pm.user_id = auth.uid()
      )
    )
  );

drop policy if exists "Projects readable by scope" on public.projects;
create policy "Projects readable by scope"
  on public.projects for select
  to authenticated
  using (
    public.current_role_active() in ('ADMIN', 'PROJECT_MANAGER')
    or exists (
      select 1 from public.tasks t
      where t.project_id = projects.id and t.assignee_id = auth.uid() and t.is_deleted = false
    )
  );

insert into public.app_migrations (version, name, note)
values ('031', '031_rls_guest_own_only', 'Guest (VIEWER) hanya membaca task/project miliknya')
on conflict (version) do nothing;
