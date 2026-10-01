-- 003_projects_workstreams_tasks.sql
-- Phase 3 & 4: projects, workstreams, tasks + RLS
-- Prinsip: ADDITIVE ONLY. Tidak menyentuh tabel profiles.
-- Semua tulis (insert/update/delete) HANYA lewat service role dari
-- Server Action yang sudah dicek requireAdmin()/requireManager().
-- RLS hanya membuka SELECT untuk user login; write ditolak di DB.

create extension if not exists pgcrypto;

-- ================================================================
-- 1. PROJECTS
-- ================================================================
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  client text,
  description text,
  project_manager_id uuid references public.profiles(id) on delete set null,
  start_date date,
  end_date date,
  status text not null default 'PLANNING'
    check (status in ('PLANNING', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint projects_dates_check check (end_date is null or start_date is null or end_date >= start_date)
);

drop trigger if exists set_projects_updated_at on public.projects;
create trigger set_projects_updated_at
  before update on public.projects
  for each row execute function public.handle_updated_at();

-- ================================================================
-- 2. WORKSTREAMS (satu workstream = satu project)
-- ================================================================
create table if not exists public.workstreams (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  name text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_workstreams_updated_at on public.workstreams;
create trigger set_workstreams_updated_at
  before update on public.workstreams
  for each row execute function public.handle_updated_at();

-- ================================================================
-- 3. TASKS (wajib project + assignee + deadline, workstream opsional)
-- ================================================================
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  workstream_id uuid references public.workstreams(id) on delete set null,
  title text not null,
  description text,
  assignee_id uuid not null references public.profiles(id) on delete restrict,
  created_by uuid references public.profiles(id) on delete set null,
  priority text not null default 'MEDIUM'
    check (priority in ('LOW', 'MEDIUM', 'HIGH')),
  status text not null default 'TODO'
    check (status in ('TODO', 'IN_PROGRESS', 'REVIEW', 'BLOCKED', 'DONE')),
  start_date date,
  deadline date not null,
  is_deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tasks_title_check check (char_length(trim(title)) > 0),
  constraint tasks_dates_check check (start_date is null or deadline >= start_date)
);

drop trigger if exists set_tasks_updated_at on public.tasks;
create trigger set_tasks_updated_at
  before update on public.tasks
  for each row execute function public.handle_updated_at();

-- Index untuk list/filter yang sering dipakai
create index if not exists tasks_project_idx on public.tasks (project_id) where is_deleted = false;
create index if not exists tasks_assignee_idx on public.tasks (assignee_id) where is_deleted = false;
create index if not exists tasks_deadline_idx on public.tasks (deadline) where is_deleted = false;
create index if not exists workstreams_project_idx on public.workstreams (project_id);

-- ================================================================
-- 4. RLS: SELECT untuk user login, WRITE hanya service role
-- ================================================================
alter table public.projects enable row level security;
alter table public.workstreams enable row level security;
alter table public.tasks enable row level security;

-- Baca: semua user login boleh baca (scope "relevant" diatur di server).
-- Tulis: TIDAK ada policy insert/update/delete untuk anon/authenticated,
-- jadi otomatis ditolak DB. Semua tulis lewat service role + cek server.
drop policy if exists "Authenticated can view projects" on public.projects;
create policy "Authenticated can view projects"
  on public.projects for select
  to authenticated
  using (true);

drop policy if exists "Authenticated can view workstreams" on public.workstreams;
create policy "Authenticated can view workstreams"
  on public.workstreams for select
  to authenticated
  using (true);

drop policy if exists "Authenticated can view active tasks" on public.tasks;
create policy "Authenticated can view active tasks"
  on public.tasks for select
  to authenticated
  using (is_deleted = false);

-- Eksplisit: cabut hak tulis (defensif, walau default sudah tidak ada).
revoke insert, update, delete on public.projects from anon, authenticated;
revoke insert, update, delete on public.workstreams from anon, authenticated;
revoke insert, update, delete on public.tasks from anon, authenticated;
grant select on public.projects to authenticated;
grant select on public.workstreams to authenticated;
grant select on public.tasks to authenticated;
