-- Rollback 031: kembali ke policy 016 (VIEWER membaca semua task dan project).
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

delete from public.app_migrations where version = '031';
