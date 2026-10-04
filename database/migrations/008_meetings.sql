-- 008_meetings.sql
-- Phase 11: Meeting Management & Scheduler.
-- ADDITIVE ONLY. Tidak mengubah tabel Phase 1-10 secara destruktif
-- (hanya menambah 2 kolom nullable di tasks + 1 kolom di notification_preferences).
--
-- Prinsip yang dipakai (sama seperti Fase 1-10):
--   1. Satu sumber kebenaran. "Meeting butuh notes" DITURUNKAN dari isi
--      kolom `notes` -- tidak ada kolom notes_status yang bisa berbeda
--      dari isi notes (pelajaran Phase 2: is_active vs status).
--   2. Semua tulis HANYA lewat service role dari Server Action yang sudah
--      mengecek role. RLS hanya membuka SELECT.
--   3. Traceability memakai kolom di tasks (bukan tabel relasi) karena
--      PRD §21 menyebut "task harus tahu sumber meeting", dan ini lebih
--      cepat (tanpa join) saat menampilkan SOURCE di Task Detail.

-- ================================================================
-- CATATAN URUTAN PENTING
-- ================================================================
-- Fungsi public.can_read_meeting() dibuat DI BAWAH (bagian 3), SESUDAH tabel
-- meetings + meeting_participants ada. Alasannya: Postgres memvalidasi body
-- fungsi saat pembuatan (check_function_bodies = on secara default), jadi
-- fungsi yang merujuk tabel yang belum ada akan gagal dengan
-- "relation public.meetings does not exist".
--
-- Urutan eksekusi file ini:
--   1. meetings
--   2. meeting_participants
--   3. can_read_meeting()          <- butuh tabel 1 & 2 sudah ada
--   4. meeting_agendas
--   5. meeting_decisions
--   6. meeting_action_items
--   7. traceability di tasks
--   8. preferensi email
--   9. RLS + policy                <- butuh fungsi sudah ada
--  10. policy activity_logs
--
-- AMAN DI-RUN ULANG: setiap statement dijaga (create table if not exists /
-- drop trigger if exists / drop policy if exists / grant / revoke / setval
-- dihitung ulang dari data). Kalau run gagal di tengah, tinggal paste ulang
-- file ini dari awal.

-- ================================================================
-- 1. MEETINGS
-- ================================================================
-- Catatan §3.2 rencana: project_id NULLABLE. PRD §10 (create global) punya
-- field "Project" dan §35 filter punya "All Projects" -> ada meeting yang
-- tidak punya project (global/ad-hoc internal).
create table if not exists public.meetings (
  id uuid primary key default gen_random_uuid(),

  -- Kode readable "M-001" (sequence, pola sama seperti migrasi 005).
  code text,

  title text not null,

  -- NULLABLE by design (lihat catatan di atas).
  project_id uuid references public.projects(id) on delete set null,

  meeting_type text not null default 'INTERNAL_MEETING'
    check (meeting_type in (
      'WEEKLY_PROJECT_REVIEW',
      'PROJECT_KICKOFF',
      'CLIENT_MEETING',
      'INTERNAL_MEETING',
      'OPERATIONAL_REVIEW',
      'MANAGEMENT_REVIEW',
      'AD_HOC',
      'OTHER'
    )),

  -- Lifecycle §13: DRAFT -> SCHEDULED -> COMPLETED, SCHEDULED -> CANCELLED.
  status text not null default 'DRAFT'
    check (status in ('DRAFT', 'SCHEDULED', 'COMPLETED', 'CANCELLED')),

  meeting_date date not null,
  start_time time not null,
  end_time time not null,

  location text,
  meeting_link text,
  description text,

  -- CATATAN: `notes` ini adalah SATU-SATUNYA sumber kebenaran "notes sudah
  -- belum". Don't add notes_status. Needs Notes =
  --   status = 'COMPLETED' and coalesce(btrim(notes), '') = ''
  notes text,

  -- §38: created_by (membuat) dan organizer_id (pemangku) sengaja dipisah.
  -- PM boleh membuat meeting behalf orang lain. Minimal salah satu wajib ada
  -- supaya tidak ada meeting tanpa pemilik.
  organizer_id uuid references public.profiles(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,

  -- ==============================================================
  -- GOOGLE CALENDAR (§25-30, Rule 1 & 2 & 7)
  -- Kasuat yang/master; Google hanya synchronization layer.
  -- Kolom ini HANYA metadata. Token OAuth TIDAK PERNAH disimpan di sini
  -- (§28) -- token disimpan di tabel google_calendar_connections terpisah
  -- (Phase 12 / Opsi B).
  -- ==============================================================
  google_calendar_id text,
  google_calendar_event_id text,
  google_sync_status text not null default 'NOT_CONNECTED'
    check (google_sync_status in (
      'NOT_CONNECTED', 'PENDING', 'SYNCED', 'FAILED', 'DISCONNECTED'
    )),
  google_sync_error text,
  google_last_synced_at timestamptz,

  -- Checkbox "Add to Google Calendar" di form create (§27).
  add_to_calendar boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint meetings_code_unique unique (code),
  constraint meetings_title_check check (char_length(trim(title)) > 0),
  constraint meetings_time_check check (end_time > start_time),
  constraint meetings_owner_check check (
    organizer_id is not null or created_by is not null
  )
);

drop trigger if exists set_meetings_updated_at on public.meetings;
create trigger set_meetings_updated_at
  before update on public.meetings
  for each row execute function public.handle_updated_at();

-- Sequence + default code (pola identik migrasi 005).
create sequence if not exists public.meeting_code_seq;
alter table public.meetings
  alter column code set default ('M-' || lpad(nextval('public.meeting_code_seq')::text, 3, '0'));

-- Defensif: kalau migrasi diulang setelah ada data, majukan sequence.
-- is_called=false saat tabel kosong (next = 1 -> M-001).
select setval(
  'public.meeting_code_seq',
  greatest(coalesce((select max(substring(code from 3)::integer) from public.meetings), 0), 1),
  coalesce((select max(substring(code from 3)::integer) from public.meetings), 0) > 0
);

-- code NOT NULL seperti tabel lain (001-007). Pakai SET NOT NULL (bukan
-- CHECK constraint) supaya identik dengan apa yang di-generate Drizzle.
alter table public.meetings alter column code set not null;

-- Index untuk list/filter yang sering dipakai.
create index if not exists meetings_project_idx on public.meetings (project_id);
create index if not exists meetings_date_idx on public.meetings (meeting_date);
create index if not exists meetings_status_idx on public.meetings (status);
create index if not exists meetings_organizer_idx on public.meetings (organizer_id);

-- Needs Notes queue (§36): index PARSIAL hanya untuk baris yang butuh
-- tindakan. Menggunakan ekspresi yang sama dengan definisi "needs notes"
-- supaya tidak mungkin berbeda dari query.
-- Catatan: tanpa DESC, supaya identik dengan apa yang di-generate Drizzle.
create index if not exists meetings_needs_notes_idx
  on public.meetings (meeting_date)
  where status = 'COMPLETED' and coalesce(btrim(notes), '') = '';

-- ================================================================
-- 2. MEETING_PARTICIPANTS
-- ================================================================
-- §39: MVP hanya Kasuat users, tapi arsitektur sudah siap untuk peserta
-- eksternal (client meeting): boleh user_id ATAU (external_name + external_email).
-- unique (meeting_id, user_id) tetap aman untuk banyak baris eksternal
-- karena Postgres menganggap setiap NULL sebagai nilai yang berbeda.
create table if not exists public.meeting_participants (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  external_name text,
  external_email text,
  attendance text not null default 'PENDING'
    check (attendance in ('PENDING', 'ACCEPTED', 'DECLINED', 'ATTENDED')),
  is_organizer boolean not null default false,
  created_at timestamptz not null default now(),

  constraint meeting_participants_user_unique unique (meeting_id, user_id),
  constraint meeting_participants_target_check check (
    user_id is not null
    or (external_name is not null and external_email is not null)
  )
);

-- (meeting_id, user_id) unique sudah melayani lookup per meeting.
create index if not exists meeting_participants_user_idx
  on public.meeting_participants (user_id, meeting_id);

-- ================================================================
-- 3. FUNCTION PEMBANTU: apakah user boleh membaca sebuah meeting?
-- ================================================================
-- Diletakkan SESUDAH tabel meetings + meeting_participants karena Postgres
-- memvalidasi body fungsi saat pembuatan (check_function_bodies default on).
--
-- Dipakai oleh policy RLS meetings + semua tabel anaknya.
-- WAJIB security definer: kalau policy meetings membaca
-- meeting_participants, DAN policy meeting_participants membaca meetings,
-- Postgres akan mendeteksi "infinite recursion in policy".
-- security definer + search_path terkunci memutus siklus itu
-- (pola yang sama seperti public.is_admin() di migrasi 001/002).
--
-- Scope (§37): admin, maker, organizer, peserta, dan PM project terkait.
create or replace function public.can_read_meeting(p_meeting_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public as $$
  select exists (
    select 1
    from public.meetings m
    where m.id = p_meeting_id
      and (
        m.created_by = p_user_id
        or m.organizer_id = p_user_id
        or exists (
          select 1
          from public.meeting_participants mp
          where mp.meeting_id = m.id
            and mp.user_id = p_user_id
        )
        or exists (
          select 1
          from public.profiles p
          where p.id = p_user_id
            and p.role = 'ADMIN'
            and p.status = 'ACTIVE'
        )
        or (
          m.project_id is not null
          and exists (
            select 1
            from public.project_managers pm
            where pm.project_id = m.project_id
              and pm.user_id = p_user_id
          )
        )
      )
  );
$$;

-- Postgres memberi EXECUTE ke PUBLIC secara default untuk function.
-- Kita perketat: hanya role login yang boleh memanggil.
revoke all on function public.can_read_meeting(uuid, uuid) from public;
grant execute on function public.can_read_meeting(uuid, uuid) to authenticated;

-- ================================================================
-- 4. MEETING_AGENDAS
-- ================================================================
-- §16: daftar terstruktur dengan urutan. Reorder = update `position`.
create table if not exists public.meeting_agendas (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  position integer not null default 0,
  title text not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint meeting_agendas_title_check check (char_length(trim(title)) > 0)
);

drop trigger if exists set_meeting_agendas_updated_at on public.meeting_agendas;
create trigger set_meeting_agendas_updated_at
  before update on public.meeting_agendas
  for each row execute function public.handle_updated_at();

create index if not exists meeting_agendas_order_idx
  on public.meeting_agendas (meeting_id, position);

-- ================================================================
-- 5. MEETING_DECISIONS
-- ================================================================
-- §18: setiap decision bisa diedit individual.
create table if not exists public.meeting_decisions (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  position integer not null default 0,
  decision text not null,
  rationale text,
  decided_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint meeting_decisions_text_check check (char_length(trim(decision)) > 0)
);

drop trigger if exists set_meeting_decisions_updated_at on public.meeting_decisions;
create trigger set_meeting_decisions_updated_at
  before update on public.meeting_decisions
  for each row execute function public.handle_updated_at();

create index if not exists meeting_decisions_order_idx
  on public.meeting_decisions (meeting_id, position);

-- ================================================================
-- 6. MEETING_ACTION_ITEMS
-- ================================================================
-- §19 + §40. `task_id` punya dua fungsi sekaligus:
--   1. Link balik ke task (§21 "Meeting juga menampilkan Action Items -> T-081")
--   2. IDEMPOTENCY GUARD (§22): kalau task_id sudah terisi, Create Task
--      kedua tidak boleh membuat task baru.
create table if not exists public.meeting_action_items (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  title text not null,
  description text,
  assignee_id uuid references public.profiles(id) on delete set null,
  deadline date,
  priority text check (priority in ('LOW', 'MEDIUM', 'HIGH')),
  -- Status action item BERBEDA dari status task (lebih sederhana):
  -- OPEN -> IN_PROGRESS -> DONE, atau DROPPED.
  status text not null default 'OPEN'
    check (status in ('OPEN', 'IN_PROGRESS', 'DONE', 'DROPPED')),
  task_id uuid references public.tasks(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint meeting_action_items_title_check check (char_length(trim(title)) > 0)
);

drop trigger if exists set_meeting_action_items_updated_at on public.meeting_action_items;
create trigger set_meeting_action_items_updated_at
  before update on public.meeting_action_items
  for each row execute function public.handle_updated_at();

create index if not exists meeting_action_items_meeting_idx
  on public.meeting_action_items (meeting_id, status);
create index if not exists meeting_action_items_assignee_idx
  on public.meeting_action_items (assignee_id)
  where status in ('OPEN', 'IN_PROGRESS');
-- Link balik ke task (Meeting -> T-081) cepat.
create index if not exists meeting_action_items_task_idx
  on public.meeting_action_items (task_id)
  where task_id is not null;

-- ================================================================
-- 7. TASK TRACEABILITY (§21)
-- ================================================================
-- Polymorphic pointer: source_id bisa menunjuk meeting / suggestion / import,
-- jadi TIDAK BISA punya foreign key. Validasi dilakukan di server
-- (Server Action) -- sama seperti metadata polymorphic di activity_logs
-- yang juga tidak punya FK.
alter table public.tasks add column if not exists source_type text;
alter table public.tasks add column if not exists source_id uuid;

alter table public.tasks
  drop constraint if exists tasks_source_type_check;
alter table public.tasks
  add constraint tasks_source_type_check check (
    source_type is null or source_type in ('MEETING', 'SUGGESTION', 'IMPORT')
  );

create index if not exists tasks_source_idx
  on public.tasks (source_type, source_id)
  where source_type is not null;

-- ================================================================
-- 8. PREFERENSI EMAIL MEETING
-- ================================================================
-- §24: email tetap mengikuti notification preferences yang existing.
-- Default true supaya tidak diam-diam mematikan email untuk user lama.
alter table public.notification_preferences
  add column if not exists email_meeting_updates boolean not null default true;

-- ================================================================
-- 9. RLS
-- ================================================================
-- Pola Phase 3: SELECT untuk user login, TIDAK ADA policy tulis untuk
-- anon/authenticated. Semua tulis lewat service role + authorization
-- server-side (app/actions/*).

alter table public.meetings enable row level security;
alter table public.meeting_participants enable row level security;
alter table public.meeting_agendas enable row level security;
alter table public.meeting_decisions enable row level security;
alter table public.meeting_action_items enable row level security;

-- meetings
drop policy if exists "Meetings readable by scope" on public.meetings;
create policy "Meetings readable by scope"
  on public.meetings for select
  to authenticated
  using (public.can_read_meeting(id, auth.uid()));

-- Tabel anak: satu panggilan function, tanpa subquery antar tabel,
-- jadi tidak ada risiko infinite recursion.
drop policy if exists "Meeting participants readable by scope"
  on public.meeting_participants;
create policy "Meeting participants readable by scope"
  on public.meeting_participants for select
  to authenticated
  using (public.can_read_meeting(meeting_id, auth.uid()));

drop policy if exists "Meeting agendas readable by scope" on public.meeting_agendas;
create policy "Meeting agendas readable by scope"
  on public.meeting_agendas for select
  to authenticated
  using (public.can_read_meeting(meeting_id, auth.uid()));

drop policy if exists "Meeting decisions readable by scope" on public.meeting_decisions;
create policy "Meeting decisions readable by scope"
  on public.meeting_decisions for select
  to authenticated
  using (public.can_read_meeting(meeting_id, auth.uid()));

drop policy if exists "Meeting action items readable by scope"
  on public.meeting_action_items;
create policy "Meeting action items readable by scope"
  on public.meeting_action_items for select
  to authenticated
  using (public.can_read_meeting(meeting_id, auth.uid()));

-- Eksplisit: cabut hak tulis (defensif, walau default sudah tidak ada).
revoke insert, update, delete on public.meetings from anon, authenticated;
revoke insert, update, delete on public.meeting_participants from anon, authenticated;
revoke insert, update, delete on public.meeting_agendas from anon, authenticated;
revoke insert, update, delete on public.meeting_decisions from anon, authenticated;
revoke insert, update, delete on public.meeting_action_items from anon, authenticated;
grant select on public.meetings to authenticated;
grant select on public.meeting_participants to authenticated;
grant select on public.meeting_agendas to authenticated;
grant select on public.meeting_decisions to authenticated;
grant select on public.meeting_action_items to authenticated;

-- ================================================================
-- 10. ACTIVITY LOG: tambahkan branch meeting
-- ================================================================
-- §23: jangan buat arsitektur audit baru. Cukup perluas policy existing
-- supaya log meeting bisa dibaca oleh yang berhak.
-- Catatan: m.id::text (BUKAN entity_id::uuid) supaya tidak ada risiko
-- cast error dari entity_id yang bukan UUID.
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
    -- Phase 11: Meeting & Action Item
    or (
      entity_type in ('meeting', 'meeting_action_item') and exists (
        select 1 from public.meetings m
        where m.id::text = activity_logs.entity_id
          and public.can_read_meeting(m.id, auth.uid())
      )
    )
    -- Action item juga perlu bisa dibaca oleh owner action item-nya
    -- meskipun meeting-nya tidak lagi bisa diakses.
    or (
      entity_type = 'meeting_action_item' and exists (
        select 1 from public.meeting_action_items mai
        where mai.id::text = activity_logs.entity_id
          and mai.created_by = auth.uid()
      )
    )
  );

-- ================================================================
-- 11. RINGKASAN
-- ================================================================
-- Tabel baru : meetings, meeting_participants, meeting_agendas,
--               meeting_decisions, meeting_action_items   (5)
-- Kolom baru : tasks.source_type, tasks.source_id         (2, nullable)
--               notification_preferences.email_meeting_updates (1)
-- Sequence   : meeting_code_seq
-- Function   : can_read_meeting(uuid, uuid) -- security definer
-- Trigger    : set_meetings_updated_at, set_meeting_agendas_updated_at,
--               set_meeting_decisions_updated_at,
--               set_meeting_action_items_updated_at
-- Regresi: tidak ada satu pun DROP COLUMN / DROP TABLE di migrasi ini.