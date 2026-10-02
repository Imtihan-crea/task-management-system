-- 006_suggestions_notifications.sql
-- Phase 5, 6, 7: task_suggestions, notifications, notification_events,
-- notification_preferences + RLS.
-- ADDITIVE ONLY. Pola sama seperti sebelumnya: SELECT terbatas untuk user
-- login, TIDAK ada policy tulis untuk anon/authenticated (semua tulis lewat
-- service role + authorization server-side).

-- ================================================================
-- 1. TASK_SUGGESTIONS (kode "S-001")
-- ================================================================
create table if not exists public.task_suggestions (
  id uuid primary key default gen_random_uuid(),
  code text,
  title text not null,
  description text not null,
  project_id uuid not null references public.projects(id) on delete restrict,
  workstream_id uuid references public.workstreams(id) on delete set null,
  suggested_assignee_id uuid references public.profiles(id) on delete set null,
  suggested_priority text
    check (suggested_priority in ('LOW', 'MEDIUM', 'HIGH')),
  suggested_deadline date,
  suggested_by uuid not null references public.profiles(id) on delete cascade,
  reviewer_id uuid references public.profiles(id) on delete set null,
  review_note text,
  status text not null default 'PENDING'
    check (status in ('PENDING', 'APPROVED', 'REVISION_REQUESTED', 'REJECTED', 'CONVERTED')),
  converted_task_id uuid references public.tasks(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint suggestions_title_check check (char_length(trim(title)) > 0),
  constraint suggestions_desc_check check (char_length(trim(description)) > 0)
);

-- Backfill code untuk baris lama (kalau migration diulang setelah ada data).
with ranked as (
  select id, row_number() over (order by created_at) as n
  from public.task_suggestions
  where code is null
)
update public.task_suggestions s
set code = 'S-' || lpad(ranked.n::text, 3, '0')
from ranked
where s.id = ranked.id;

alter table public.task_suggestions alter column code set not null;

create sequence if not exists public.suggestion_code_seq;
select setval(
  'public.suggestion_code_seq',
  coalesce((select max(substring(code from 3)::integer) from public.task_suggestions), 0)
);
alter table public.task_suggestions
  alter column code set default ('S-' || lpad(nextval('public.suggestion_code_seq')::text, 3, '0'));

do $$ begin
  alter table public.task_suggestions add constraint suggestions_code_unique unique (code);
exception when duplicate_object or duplicate_table then null;
end $$;

drop trigger if exists set_suggestions_updated_at on public.task_suggestions;
create trigger set_suggestions_updated_at
  before update on public.task_suggestions
  for each row execute function public.handle_updated_at();

create index if not exists suggestions_project_idx on public.task_suggestions (project_id);
create index if not exists suggestions_by_idx on public.task_suggestions (suggested_by);
create index if not exists suggestions_status_idx on public.task_suggestions (status);

-- ================================================================
-- 2. NOTIFICATIONS (in-app)
-- ================================================================
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null,
  title text not null,
  message text not null default '',
  entity_type text not null default '',
  entity_id text not null default '',
  is_read boolean not null default false,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index if not exists notifications_user_idx
  on public.notifications (user_id, created_at desc);
create index if not exists notifications_unread_idx
  on public.notifications (user_id) where is_read = false;

-- ================================================================
-- 3. NOTIFICATION_EVENTS (idempotency: satu event = satu pengiriman)
-- ================================================================
create table if not exists public.notification_events (
  event_key text primary key,
  created_at timestamptz not null default now()
);

-- ================================================================
-- 4. NOTIFICATION_PREFERENCES (satu baris per user, default ON semua)
-- ================================================================
create table if not exists public.notification_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  email_enabled boolean not null default true,
  email_task_updates boolean not null default true,
  email_suggestion_updates boolean not null default true,
  email_deadline_alerts boolean not null default true,
  updated_at timestamptz not null default now()
);

drop trigger if exists set_notif_prefs_updated_at on public.notification_preferences;
create trigger set_notif_prefs_updated_at
  before update on public.notification_preferences
  for each row execute function public.handle_updated_at();

-- ================================================================
-- 5. RLS
-- ================================================================
alter table public.task_suggestions enable row level security;
alter table public.notifications enable row level security;
alter table public.notification_events enable row level security;
alter table public.notification_preferences enable row level security;

-- Suggestions: creator lihat miliknya; PM lihat suggestion di project miliknya;
-- admin lihat semua.
drop policy if exists "Suggestions readable by scope" on public.task_suggestions;
create policy "Suggestions readable by scope"
  on public.task_suggestions for select
  to authenticated
  using (
    suggested_by = auth.uid()
    or exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'ADMIN' and status = 'ACTIVE'
    )
    or exists (
      select 1 from public.project_managers
      where project_id = task_suggestions.project_id
        and user_id = auth.uid()
    )
  );

-- Notifications: user hanya baca miliknya.
drop policy if exists "Users read own notifications" on public.notifications;
create policy "Users read own notifications"
  on public.notifications for select
  to authenticated
  using (user_id = auth.uid());

-- Preferences: user hanya baca miliknya.
drop policy if exists "Users read own preferences" on public.notification_preferences;
create policy "Users read own preferences"
  on public.notification_preferences for select
  to authenticated
  using (user_id = auth.uid());

-- notification_events: TANPA policy baca/tulis untuk anon & authenticated
-- (hanya service role). Tidak perlu policy sama sekali.

-- Eksplisit cabut hak tulis di semua tabel baru.
revoke insert, update, delete on public.task_suggestions from anon, authenticated;
revoke insert, update, delete on public.notifications from anon, authenticated;
revoke insert, update, delete on public.notification_events from anon, authenticated;
revoke insert, update, delete on public.notification_preferences from anon, authenticated;
grant select on public.task_suggestions to authenticated;
grant select on public.notifications to authenticated;
grant select on public.notification_preferences to authenticated;
