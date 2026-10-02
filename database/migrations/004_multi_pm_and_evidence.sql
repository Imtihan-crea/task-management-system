-- 004_multi_pm_and_evidence.sql
-- Phase 3&4 update (disetujui user):
-- 1. Satu project bisa punya banyak PM -> tabel relasi project_managers.
--    SATU sumber kebenaran: kolom lama projects.project_manager_id
--    di-backfill lalu DIHAPUS (pelajaran dari is_active vs status).
-- 2. tasks.evidence_url (nullable, link opsional, tetap bisa diubah setelah DONE).

-- ================================================================
-- 1. TABEL RELASI PROJECT MANAGERS
-- ================================================================
create table if not exists public.project_managers (
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

create index if not exists project_managers_user_idx
  on public.project_managers (user_id);

-- Backfill dari kolom lama SEBELUM dihapus.
insert into public.project_managers (project_id, user_id)
select id, project_manager_id
from public.projects
where project_manager_id is not null
on conflict do nothing;

-- Hapus kolom lama: satu-satunya sumber kebenaran adalah tabel relasi.
alter table public.projects drop column if exists project_manager_id;

-- ================================================================
-- 2. EVIDENCE URL PADA TASKS
-- ================================================================
alter table public.tasks
  add column if not exists evidence_url text;

-- ================================================================
-- 3. RLS: SELECT untuk user login, WRITE hanya service role
-- ================================================================
alter table public.project_managers enable row level security;

drop policy if exists "Authenticated can view project managers"
  on public.project_managers;
create policy "Authenticated can view project managers"
  on public.project_managers for select
  to authenticated
  using (true);

revoke insert, update, delete on public.project_managers from anon, authenticated;
grant select on public.project_managers to authenticated;
