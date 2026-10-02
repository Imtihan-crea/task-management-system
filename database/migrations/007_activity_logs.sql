-- 007_activity_logs.sql
-- Phase 8: activity_logs append-only + RLS.
-- ADDITIVE ONLY. Tidak ada policy tulis untuk anon/authenticated
-- (semua tulis lewat service role dari lib/activity-log/service.ts).

create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references public.profiles(id) on delete set null,
  actor_type text not null default 'USER'
    check (actor_type in ('USER', 'SYSTEM')),
  action text not null,
  entity_type text not null default '',
  entity_id text not null default '',
  entity_code text not null default '',
  project_id uuid references public.projects(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  request_id text,
  created_at timestamptz not null default now()
);

create index if not exists activity_entity_idx
  on public.activity_logs (entity_type, entity_id, created_at desc);
create index if not exists activity_actor_idx
  on public.activity_logs (actor_user_id, created_at desc);
create index if not exists activity_project_idx
  on public.activity_logs (project_id, created_at desc);
create index if not exists activity_created_idx
  on public.activity_logs (created_at desc);

alter table public.activity_logs enable row level security;

-- Baca: admin semua; PM/member/viewer hanya yang terkait scope-nya.
-- Scope detail dicek di server; RLS memberi batas minimum:
-- user melihat log miliknya ATAU log entity yang bisa dia akses dibuktikan
-- via relasi task/project/suggestion yang visible.
drop policy if exists "Activity readable by scope" on public.activity_logs;
create policy "Activity readable by scope"
  on public.activity_logs for select
  to authenticated
  using (
    -- milik sendiri
    actor_user_id = auth.uid()
    -- admin melihat semua
    or exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'ADMIN' and status = 'ACTIVE'
    )
    -- PM melihat log project miliknya
    or (
      project_id is not null and exists (
        select 1 from public.project_managers
        where project_id = activity_logs.project_id
          and user_id = auth.uid()
      )
    )
    -- assignee melihat log task miliknya
    or (
      entity_type = 'task' and exists (
        select 1 from public.tasks
        where id::text = activity_logs.entity_id
          and assignee_id = auth.uid()
          and is_deleted = false
      )
    )
    -- creator melihat log suggestion miliknya
    or (
      entity_type = 'suggestion' and exists (
        select 1 from public.task_suggestions
        where id::text = activity_logs.entity_id
          and suggested_by = auth.uid()
      )
    )
  );

-- TIDAK ada policy insert/update/delete untuk anon & authenticated:
-- append-only, hanya service role yang menulis.
revoke insert, update, delete on public.activity_logs from anon, authenticated;
grant select on public.activity_logs to authenticated;
