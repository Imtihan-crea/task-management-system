-- Rollback 016: kembali ke policy baca longgar (semua user ACTIVE) dari 003,
-- dan kembalikan grant/EXECUTE default.
drop policy if exists "Tasks readable by scope" on public.tasks;
create policy "Authenticated can view active tasks"
  on public.tasks for select to authenticated using (is_deleted = false);

drop policy if exists "Projects readable by scope" on public.projects;
create policy "Authenticated can view projects"
  on public.projects for select to authenticated using (true);

drop policy if exists "Workstreams readable by scope" on public.workstreams;
create policy "Authenticated can view workstreams"
  on public.workstreams for select to authenticated using (true);

drop function if exists public.current_role_active();

grant execute on function public.count_active_admins(uuid) to public;
grant execute on function public.is_admin() to public;
grant truncate, references, trigger on all tables in schema public to anon, authenticated;
grant insert, delete on public.profiles to anon, authenticated;
-- "all tables" di atas ikut menyentuh app_migrations; 015 menutupnya penuh.
revoke all on public.app_migrations from anon, authenticated;

delete from public.app_migrations where version = '016';
