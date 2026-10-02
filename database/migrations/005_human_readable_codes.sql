-- 005_human_readable_codes.sql
-- ADDITIVE ONLY. Menambah kolom code yang readable:
--   projects    -> "001", "002", ...
--   workstreams -> "A", "B", ... (per project)
--   tasks       -> "T-01", "T-02", ...
-- Baris lama di-backfill berdasar created_at. Tidak ada yang dihapus/diubah.

-- Helper: 1->A ... 26->Z, 27->AA, dst.
create or replace function public.num_to_letters(n bigint)
returns text language plpgsql immutable as $$
declare
  result text := '';
  m bigint := n;
begin
  if n is null or n < 1 then return 'A'; end if;
  while m > 0 loop
    m := m - 1;
    result := chr((65 + (m % 26))::integer) || result;
    m := m / 26;
  end loop;
  return result;
end;
$$;

-- ================================================================
-- 1. PROJECTS.code ("001")
-- ================================================================
alter table public.projects
  add column if not exists code text;

-- Backfill: nomor urut berdasar created_at.
with ranked as (
  select id, row_number() over (order by created_at) as n
  from public.projects
  where code is null
)
update public.projects p
set code = lpad(ranked.n::text, 3, '0')
from ranked
where p.id = ranked.id;

alter table public.projects alter column code set not null;

-- Sequence untuk project baru (lanjut setelah nomor terbesar).
create sequence if not exists public.project_code_seq;
select setval(
  'public.project_code_seq',
  coalesce((select max(code::integer) from public.projects), 0)
);
alter table public.projects
  alter column code set default lpad(nextval('public.project_code_seq')::text, 3, '0');

do $$ begin
  alter table public.projects add constraint projects_code_unique unique (code);
exception when duplicate_object or duplicate_table then null;
end $$;

-- ================================================================
-- 2. WORKSTREAMS.code ("A" per project)
-- ================================================================
alter table public.workstreams
  add column if not exists code text;

with ranked as (
  select id, row_number() over (partition by project_id order by created_at) as n
  from public.workstreams
  where code is null
)
update public.workstreams w
set code = public.num_to_letters(ranked.n)
from ranked
where w.id = ranked.id;

alter table public.workstreams alter column code set not null;

-- Trigger: workstream baru otomatis dapat huruf berikutnya di project itu.
create or replace function public.assign_workstream_code()
returns trigger language plpgsql as $$
declare
  n bigint;
begin
  if NEW.code is not null then return NEW; end if;
  select count(*) + 1 into n
  from public.workstreams
  where project_id = NEW.project_id;
  NEW.code := public.num_to_letters(n);
  return NEW;
end;
$$;

drop trigger if exists set_workstream_code on public.workstreams;
create trigger set_workstream_code
  before insert on public.workstreams
  for each row execute function public.assign_workstream_code();

do $$ begin
  alter table public.workstreams add constraint workstreams_project_code_unique unique (project_id, code);
exception when duplicate_object or duplicate_table then null;
end $$;

-- ================================================================
-- 3. TASKS.code ("T-01")
-- ================================================================
alter table public.tasks
  add column if not exists code text;

with ranked as (
  select id, row_number() over (order by created_at) as n
  from public.tasks
  where code is null
)
update public.tasks t
set code = 'T-' || lpad(ranked.n::text, 2, '0')
from ranked
where t.id = ranked.id;

alter table public.tasks alter column code set not null;

create sequence if not exists public.task_code_seq;
select setval(
  'public.task_code_seq',
  coalesce((select max(substring(code from 3)::integer) from public.tasks), 0)
);
alter table public.tasks
  alter column code set default ('T-' || lpad(nextval('public.task_code_seq')::text, 2, '0'));

do $$ begin
  alter table public.tasks add constraint tasks_code_unique unique (code);
exception when duplicate_object or duplicate_table then null;
end $$;

-- ================================================================
-- 4. RLS: tidak ada perubahan hak (kolom baru ikut policy SELECT lama)
-- ================================================================
-- Tidak perlu policy baru: SELECT yang sudah ada mencakup semua kolom.
