-- 021_hr_tracker.sql
-- 16 Nov 2026: HR Tahap 1 — profil karyawan + Daily Tracker (pengganti sheet
-- "Daily <Bulan> 26"). Rencana: private/handoff/2026-11-16-pemetaan-hr-kpi.md bagian J.
--
-- - profiles: divisi, jabatan, level jabatan (cabang 360° nanti), tanggal masuk, kuota cuti.
-- - hr_settings: aturan berversi per tanggal berlaku (kategori, lokasi, jam/hari,
--   ambang status). Kosong = default di lib/hr/settings.ts.
-- - work_calendar: tanggal libur / cuti bersama, atau hari kerja pengganti di akhir pekan.
-- - hr_month_targets: target jam bulanan yang dikunci manual oleh HR (menimpa hari kerja × 8).
-- - work_logs: satu baris = satu aktivitas (jam mulai–selesai, tidak lewat tengah malam).
-- - work_log_comments: komentar pemeriksa (HR/PM) pada satu aktivitas.
--
-- Tulis hanya lewat server action (service role). User biasa hanya bisa membaca
-- miliknya sendiri. Tidak ada baris data yang diubah.
-- Rollback: database/migrations/down/021_hr_tracker.down.sql

alter table public.profiles
  add column if not exists division text check (division is null or char_length(division) between 1 and 60),
  add column if not exists position_title text check (position_title is null or char_length(position_title) between 1 and 80),
  add column if not exists position_level text check (position_level is null or position_level in ('STAFF', 'SUPERVISOR', 'PROJECT_MANAGER', 'BUSINESS_LEAD')),
  add column if not exists join_date date,
  add column if not exists annual_leave_quota smallint check (annual_leave_quota is null or annual_leave_quota between 0 and 60);

create table if not exists public.hr_settings (
  id uuid primary key default gen_random_uuid(),
  effective_from date not null unique,
  rules jsonb not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.work_calendar (
  day date primary key,
  kind text not null check (kind in ('HOLIDAY', 'WORKDAY')),
  name text not null check (char_length(name) between 1 and 120),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.hr_month_targets (
  month date primary key check (extract(day from month) = 1),
  target_hours numeric(6, 2) not null check (target_hours > 0 and target_hours <= 400),
  note text check (note is null or char_length(note) <= 500),
  created_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.work_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  work_date date not null,
  project_id uuid references public.projects(id) on delete set null,
  -- Nama proyek saat dicatat; tetap terbaca bila project dihapus atau data import.
  project_name text not null check (char_length(project_name) between 1 and 150),
  activity text not null check (char_length(activity) between 1 and 300),
  detail text check (detail is null or char_length(detail) <= 5000),
  start_time time not null,
  end_time time not null,
  duration_minutes integer generated always as ((extract(epoch from (end_time - start_time)) / 60)::integer) stored,
  location text not null check (char_length(location) between 1 and 60),
  category text not null check (char_length(category) between 1 and 60),
  output text check (output is null or char_length(output) <= 2000),
  source text not null default 'APP' check (source in ('APP', 'IMPORT')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint work_logs_end_after_start check (end_time > start_time)
);

create index if not exists work_logs_user_date on public.work_logs (user_id, work_date);
create index if not exists work_logs_date on public.work_logs (work_date);
create index if not exists work_logs_project_date on public.work_logs (project_id, work_date);

create table if not exists public.work_log_comments (
  id uuid primary key default gen_random_uuid(),
  work_log_id uuid not null references public.work_logs(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete set null,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index if not exists work_log_comments_log on public.work_log_comments (work_log_id);

alter table public.hr_settings enable row level security;
alter table public.work_calendar enable row level security;
alter table public.hr_month_targets enable row level security;
alter table public.work_logs enable row level security;
alter table public.work_log_comments enable row level security;

revoke all on public.hr_settings, public.work_calendar, public.hr_month_targets,
  public.work_logs, public.work_log_comments from anon, authenticated;
grant select on public.work_calendar, public.work_logs, public.work_log_comments to authenticated;

drop policy if exists "Active users read calendar" on public.work_calendar;
create policy "Active users read calendar" on public.work_calendar
  for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.status = 'ACTIVE'));

drop policy if exists "Users read own work logs" on public.work_logs;
create policy "Users read own work logs" on public.work_logs
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "Users read comments on own work logs" on public.work_log_comments;
create policy "Users read comments on own work logs" on public.work_log_comments
  for select to authenticated
  using (exists (select 1 from public.work_logs w where w.id = work_log_id and w.user_id = auth.uid()));

insert into public.app_migrations (version, name, note)
values ('021', '021_hr_tracker', 'profil karyawan + hr_settings, work_calendar, hr_month_targets, work_logs, work_log_comments')
on conflict (version) do nothing;
