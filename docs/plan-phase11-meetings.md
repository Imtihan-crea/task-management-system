# Implementation Plan — Phase 11 (Meeting Management & Scheduler)

**Status:** eksekusi selesai 5 Oktober 2026 (13 bucket + 2 fix). Laporan:
`docs/completion-report-phase11-meetings.md`. Sisa owner: SQL pg_cron (§10.4),
reset sequence (opsional), acceptance test §48.
**PRD:** `PRD-11-Meeting-Management-Scheduler.md`
**Baseline:** Phase 1–10 di production.

---

## 1. Hasil Inspeksi (PRD §50)

| # | Yang dicek | Temuan |
| --- | --- | --- |
| 1 | PRD | Dibaca penuh (1527 baris) |
| 2 | Completion report Phase 8–9 | Ada di `docs/`, pola pelaporan sudah konsisten |
| 3 | PRD Phase 10 UI/UX | Shell persisten, Suspense per area, `cache()` per request |
| 4 | Routing/layout | `app/(app)/` = route group, auth di `layout.tsx`, `AppShell` = passthrough |
| 5 | Project Detail | Tab berbasis URL `?tab=`, 6 tab, `components/projects/workspace/` |
| 6 | Task schema + create flow | `app/actions/tasks.ts` (793 baris), `requireManager()` + cek PM per aksi |
| 7 | Activity Log service | `logActivity()` — append-only, secret di-strip, `ActivityAction` union |
| 8 | Notification service | `emitNotification()` — klaim `event_key` dulu (idempotent) → in-app → email |
| 9 | Scheduler/automation | `app/api/cron/deadlines/route.ts`, `Bearer CRON_SECRET`, `emitNotification` |
| 10 | Auth/user schema | `profiles` + `status` (INVITED/ACTIVE/INACTIVE), `is_active` generated |
| 11 | RLS | SELECT untuk authenticated, **tidak ada** policy tulis, revoke eksplisit |
| 12 | Env convention | `.env.local`, semua `process.env.*` via lib kecil (`getAppBaseUrl`) |
| 13 | External integration | Email = Brevo (`BREVO_API_KEY`). **Belum ada pola OAuth sama sekali** |
| 14 | Reusable UI | `primitives.tsx`, `Badges.tsx`, `Skeleton.tsx`, `Tabs.tsx`, `Pagination.tsx` |

### Temuan yang membentuk keputusan

1. **Group `COLLABORATION` sudah ada** di `Sidebar.tsx` — tinggal tambah 1 item + 1 ikon SVG.
2. **Pola idempotency sudah ada dan siap dipakai.** `approveSuggestionInternal()` di
   `app/actions/suggestions.ts:415-523` adalah pola persis untuk Action Item → Task:
   cek guard → insert → update `.eq('status', 'LAMA')` → kalau 0 baris maka kalah race →
   bersihkan duplikat. Tidak perlu arsitektur baru.
3. **Tidak ada Infrastruktur OAuth di repo.** Ini gap terbesar untuk Google Calendar.
4. **`todayISO()` memakai UTC** (`new Date().toISOString().slice(0,10)`). Untuk
   reminder meeting (15 menit sebelum) timezone adalah hal kritis, tidak boleh
   diasumsikan.
5. **Vercel Hobby tidak bisa cron lebih dari 1×/hari.** Dokumentasi resmi:
   *"Hobby accounts are limited to cron jobs that run once per day. Cron expressions
   that would run more frequently will fail during deployment."*
   Reminder 15 menit **tidak bisa** pakai `*/15` di Hobby — dan akan ** menggagalkan
   seluruh deployment**.

---

## 2. Keputusan Arsitektur

Semua keputusan ini mengikuti PRD §51 (Critical Architecture Rules) dan prinsip
Phase 1–9 (satu sumber kebenaran, additive only, tidak buat sistem paralel).

| PRD §51 | Bagaimana diimplementasikan |
| --- | --- |
| Rule 1 — Kasuat owns Meeting | `meetings` tabel lokal, selalu. Tidak ada state yang hanya hidup di Google |
| Rule 2 — Google = sync layer | Kolom `google_*` hanya metadata. Meeting utuh tanpa Google |
| Rule 3 — No 2nd notification gateway | Semua lewat `emitNotification()` yang sudah ada |
| Rule 4 — No 2nd audit architecture | Semua lewat `logActivity()`. Cukup menambah enum |
| Rule 5 — No 2nd Task system | Action Item → Task memakai `tasks` yang sudah ada |
| Rule 6 — Project context first-class | `project_id` otomatis terkunci saat create dari Project |
| Rule 7 — External failure safe | Gagal Google ≠ gagal create Meeting; `google_sync_status = 'FAILED'` + tombol Retry |
| Rule 8 — Automation idempotent | `event_key` = `meeting-reminder:<id>:<date>` (mekanisme existing) |
| Rule 9 — AI recommend, human approve | Struktur data siap; tidak ada auto-mutate dari AI di fase ini |

---

## 3. Penyimpangan dari PRD (usulan — disetujui owner 4 Oktober 2026)

PRD §40 sendiri menulis: *"Do not implement this schema blindly."* Empat penyimpangan
yang saya usulkan:

### 3.1 `notes_status` DIHAPUS — diturunkan dari `notes`

PRD §40 proposing `notes_status`. Kalau disimpan, kita punya dua sumber kebenaran
untuk "notes sudah belum" (`notes` vs `notes_status`) — **pelajaran persis dari
Phase 2 (`is_active` vs `status`)**.

Solusinya: `Needs Notes = status = 'COMPLETED' AND coalesce(btrim(notes),'') = ''`.
Bisa di-index, tidak mungkin drift, dan tidak butuh enum tambahan.

### 3.2 `project_id` NULLABLE di `meetings`

PRD §10 (create global) memunculkan field "Project", dan §35 filter punya
"All Projects" → berarti ada meeting tanpa project. Jadi `project_id` nullable
(`on delete set null`). Meeting yang project-nya dihapus tidak ikut hilang.

### 3.3 Task traceability = kolom di `tasks`, bukan tabel relasi

PRD §21 menyarankan `tasks.source_type` + `tasks.source_id`. Saya setuju — dan
justru lebih baik dari tabel relasi karena:
- lebih cepat (tanpa join) saat menampilkan "SOURCE" di Task Detail
- preseden sudah ada: `evidence_url` ditambahkan sebagai kolom nullable di migrasi 004
- `source_id` polimorfik jadi **tidak bisa** punya FK → divalidasi di level aplikasi

Arah sebaliknya tetap ada lewat `meeting_action_items.task_id` (dipakai juga untuk
idempotency §22). Jadi dua arah tetap terpenuhi tanpa tabel baru.

### 3.4 `created_by` DAN `organizer_id` dipisah (PRD §38)

Sudah diminta PRD. Yang perlu-CEKLAT: meeting **wajib** punya salah satu dari keduanya
(check constraint), supaya tidak ada meeting "tanpa pemilik".

---

## 4. Data Model (migration `008_meetings.sql`)

Mengikuti gaya migrasi 001–007: `additive only`, header komentar, RLS di akhir,
`revoke` eksplisit.

### 4.1 Sequence + code (mengikuti pola migrasi 005)

```sql
create sequence if not exists public.meeting_code_seq;
-- code "M-001", "M-002", ... (default di kolom)
```
PRD §21 contoh menulis "Meeting #012", jadi code readable memang dibutuhkan.

### 4.2 `meetings`

```sql
create table if not exists public.meetings (
  id uuid primary key default gen_random_uuid(),
  code text,
  title text not null,
  -- §3.2: nullable = global meeting
  project_id uuid references public.projects(id) on delete set null,
  meeting_type text not null default 'INTERNAL_MEETING'
    check (meeting_type in ('WEEKLY_PROJECT_REVIEW','PROJECT_KICKOFF',
      'CLIENT_MEETING','INTERNAL_MEETING','OPERATIONAL_REVIEW',
      'MANAGEMENT_REVIEW','AD_HOC','OTHER')),
  status text not null default 'DRAFT'
    check (status in ('DRAFT','SCHEDULED','COMPLETED','CANCELLED')),
  meeting_date date not null,
  start_time time not null,
  end_time time not null,
  location text,
  meeting_link text,
  description text,
  notes text,                       -- §3.1: sumber kebenaran "needs notes"
  organizer_id uuid references public.profiles(id) on delete set null,
  created_by  uuid references public.profiles(id) on delete set null,
  -- §28: hanya metadata. Token OAuth TIDAK pernah di sini.
  google_calendar_id text,
  google_calendar_event_id text,
  google_sync_status text not null default 'NOT_CONNECTED'
    check (google_sync_status in
      ('NOT_CONNECTED','PENDING','SYNCED','FAILED','DISCONNECTED')),
  google_sync_error text,
  google_last_synced_at timestamptz,
  add_to_calendar boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint meetings_title_check check (char_length(trim(title)) > 0),
  constraint meetings_time_check check (end_time > start_time),
  constraint meetings_code_unique unique (code),
  constraint meetings_owner_check check (organizer_id is not null or created_by is not null)
);
create index meetings_project_idx on public.meetings (project_id);
create index meetings_date_idx    on public.meetings (meeting_date);
create index meetings_status_idx  on public.meetings (status);
-- Needs Notes queue (§36): hanya yang butuh tindakan
create index meetings_needs_notes_idx on public.meetings (meeting_date desc)
  where status = 'COMPLETED' and coalesce(btrim(notes), '') = '';
```

Trigger `set_meetings_updated_at` memakai `public.handle_updated_at()` yang sudah ada.

### 4.3 `meeting_participants` (§39)

```sql
create table if not exists public.meeting_participants (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  -- §39: siap untuk peserta eksternal (client meeting / Google)
  external_name text,
  external_email text,
  attendance text not null default 'PENDING'
    check (attendance in ('PENDING','ACCEPTED','DECLINED','ATTENDED')),
  is_organizer boolean not null default false,
  created_at timestamptz not null default now(),
  constraint meeting_participants_user_unique unique (meeting_id, user_id),
  constraint meeting_participants_target_check check (
    user_id is not null
    or (external_name is not null and external_email is not null)
  )
);
create index meeting_participants_user_idx
  on public.meeting_participants (user_id, meeting_id);
```

`unique (meeting_id, user_id)` aman untuk peserta eksternal karena Postgres
memperlakukan NULL sebagai berbeda — jadi banyak baris eksternal tidak bentrok.

### 4.4 `meeting_agendas` (§16)

```sql
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
create index meeting_agendas_order_idx
  on public.meeting_agendas (meeting_id, position);
```

### 4.5 `meeting_decisions` (§18)

```sql
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
create index meeting_decisions_order_idx
  on public.meeting_decisions (meeting_id, position);
```

### 4.6 `meeting_action_items` (§19, §40)

```sql
create table if not exists public.meeting_action_items (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  title text not null,
  description text,
  assignee_id uuid references public.profiles(id) on delete set null,
  deadline date,
  priority text check (priority in ('LOW','MEDIUM','HIGH')),
  status text not null default 'OPEN'
    check (status in ('OPEN','IN_PROGRESS','DONE','DROPPED')),
  -- §22: ini yang dipakai sebagai idempotency guard Create Task
  task_id uuid references public.tasks(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint meeting_action_items_title_check
    check (char_length(trim(title)) > 0)
);
create index meeting_action_items_meeting_idx
  on public.meeting_action_items (meeting_id, status);
create index meeting_action_items_open_idx
  on public.meeting_action_items (deadline)
  where status in ('OPEN','IN_PROGRESS');
```

### 4.7 Traceability di `tasks` (§21)

```sql
alter table public.tasks add column if not exists source_type text;
alter table public.tasks add column if not exists source_id uuid;
alter table public.tasks
  add constraint tasks_source_type_check check
  (source_type is null or source_type in ('MEETING','SUGGESTION','IMPORT'));
create index tasks_source_idx on public.tasks (source_type, source_id)
  where source_type is not null;
```

### 4.8 Preferensi notifikasi email

```sql
alter table public.notification_preferences
  add column if not exists email_meeting_updates boolean not null default true;
```

Ditambah checkbox baru di Settings → "Email Preferences" (konsisten dengan 4 yang sudah ada).

### 4.9 RLS (pola existing, §11 Fase 3)

Semua tabel baru:
```sql
alter table public.meetings enable row level security;
-- dst. untuk: meetings, meeting_participants, meeting_agendas,
--            meeting_decisions, meeting_action_items
revoke insert, update, delete on ... from anon, authenticated;
grant select on ... to authenticated;
```

Policy baca `meetings` (meniru policy `task_suggestions`):
```sql
create policy "Meetings readable by scope" on public.meetings
  for select to authenticated using (
    created_by = auth.uid()
    or organizer_id = auth.uid()
    or exists (select 1 from public.meeting_participants
                where meeting_id = meetings.id and user_id = auth.uid())
    or exists (select 1 from public.profiles
                where id = auth.uid() and role = 'ADMIN' and status = 'ACTIVE')
    or (project_id is not null and exists (
          select 1 from public.project_managers
          where project_id = meetings.project_id and user_id = auth.uid()))
  );
```

Tabel anak (agenda/decisions/action_items/participants) memakai policy sederhana:
`exists (select 1 from public.meetings m where m.id = <x>.meeting_id)` +
`membaca participants` juga butuh agar `meeting_participants` bisa dibaca bersama
dengan policy yang sama ( Supabase menglates nested select dengan RLS,
jadi aman).

Policy `activity_logs` di-`drop` + dibuat ulang dengan tambahan branch meeting
(§23 — tidak buat arsitektur audit baru, hanya perluas yang existing).

### 4.10 Scope di level aplikasi

`lib/data/meetings.ts` → `getMeetingScope(userId, role)` di-`cache()`,
meniru `getDashboardScope()`. Dipakai bersama oleh dashboard meeting, RLS helper,
dan form. **Satu sumber kebenaran scope** (mengikuti pelajaran Phase 10 di Gantt).

---

## 5. Permission (PRD §37)

Tambah ke `Permission` union + `ROLE_PERMISSIONS`:

| Capability | Permission | ADMIN | PM | TEAM | VIEWER |
| --- | --- | :-: | :-: | :-: | :-: |
| View meetings | `meetings.view` | ✓ | ✓ | ✓ | ✓ |
| Create meeting | `meetings.create` | ✓ | ✓ | ✓ | ✗ |
| Edit meeting | `meetings.edit` | ✓ | ✓ | scoped | ✗ |
| Complete meeting | `meetings.complete` | ✓ | ✓ | organizer | ✗ |
| Cancel meeting | `meetings.cancel` | ✓ | ✓ | organizer | ✗ |
| Manage participants | `meetings.manageParticipants` | ✓ | ✓ | organizer | ✗ |
| Action Item → Task | `tasks.create` (existing) | ✓ | ✓ | ✓ | ✗ |

PRD §37 menulis "Create meeting untuk Viewer: configurable". Saya usulkan **tidak**
(configurable selalu dijawab secara eksplisit, bukan implisit) → Viewer's answer = tidak,
dan ini menunjukkan disengaja lewat permission eksplisit.

"Organizer/permission" (cancel, complete, manage participants) dicek di server:
`ADMIN` → boleh; selain itu organizer atau peserta meeting yang aktif; PM project
ternailai juga boleh.

---

## 6. Aktivitas & Notifikasi (PRD §23, §24)

### 6.1 Activity Log — tambah enum saja

`ActivityAction` += 14 aksi persis seperti PRD §23:
`MEETING_CREATED`, `MEETING_UPDATED`, `MEETING_SCHEDULED`, `MEETING_COMPLETED`,
`MEETING_CANCELLED`, `MEETING_PARTICIPANT_ADDED`, `MEETING_PARTICIPANT_REMOVED`,
`MEETING_AGENDA_UPDATED`, `MEETING_DECISION_CREATED`, `MEETING_ACTION_ITEM_CREATED`,
`MEETING_ACTION_ITEM_UPDATED`, `MEETING_TASK_CREATED`, `MEETING_SYNCED`,
`MEETING_SYNC_FAILED`.

`ActivityEntityType` += `'meeting'`, `'meeting_action_item'`.

### 6.2 Notification — satu gateway

`NotificationType` += `MEETING_INVITATION`, `MEETING_UPDATED`, `MEETING_CANCELLED`,
`MEETING_COMPLETED`, `MEETING_REMINDER`, `MEETING_NOTES_PENDING`.

`NotificationEntityType` += `'meeting'`, `'meeting_action_item'`.
`notificationHref()` += `/meetings/${id}` dan `/meetings/${id}?tab=actions`.

`EmailCategory` += `'meeting'` → dipetakan ke `email_meeting_updates` baru.

---

## 7. Action Item → Task (§20, §21, §22) — core feature

Mengikuti **persis** pola `approveSuggestionInternal()`:

```
1. Guard: action_item.task_id != null  →  return "Task already exists: T-081"
2. Insert tasks dengan metadata warisan:
     title       ← action_item.title
     description ← action_item.description
     project_id  ← meeting.project_id          (WAJIB ada; kalau null → tolak)
     assignee_id ← action_item.assignee_id
     deadline    ← action_item.deadline
     priority    ← action_item.priority
     source_type = 'MEETING'
     source_id   = meeting.id
3. Update meeting_action_items SET task_id = <id>
     WHERE id = ? AND task_id IS NULL      ← atomic guard
4. Kalau 0 baris → kalah race → soft-delete task yang terlanjur dibuat
5. logActivity('MEETING_TASK_CREATED') + logActivity('TASK_CREATED')
6. Kirim email "Task assigned" yang existing ke assignee
```

Workstream opsional (§20: *"Workstream dapat dipilih saat Task dibuat jika belum
diketahui"*) → form Create Task punya dropdown workstream opsional, default kosong.

**Perubahan aturan Task?** Tidak ada. `validateTaskFields()` dan `assertActiveUser()`
dipakai ulang apa adanya → §47 (Meeting tidak boleh mengubah aturan bisnis Task)
terpenuhi.

**Task Detail** (§21): blok SOURCE baru — hanya tampil kalau `task.source_type` ada:
```
SOURCE
Meeting M-003 · Weekly Project Review   [View Meeting]
```

**Meeting Detail → Action Items** (§21):
```
✓ Update warehouse layout    → T-081
✓ Confirm vendor capacity    → T-082
○ Follow up vendor           [Create Task]
```

---

## 8. Rute & Halaman

| Rute | Isi |
| --- | --- |
| `/meetings` | Global Meeting Dashboard: KPI, 5 tab, filter, list |
| `/meetings/new` | Create global. `?project=<id>` → Project terkunci (§3) |
| `/meetings/[id]` | Workspace: Overview · Agenda · Notes · Decisions · Actions · Activity |
| `/meetings/[id]/edit` | Edit (organization/permission) |
| `/projects/[id]?tab=meetings` | Tab baru di Project Detail, antara Tasks dan Activity (§2) |
| `/api/cron/meetings` | Reminder + notes reminder |
| `/api/google/*` | (fase OAuth — lihat §11) |

Pola URL create dari Project mengikuti arsitektur existing (persis seperti
`/workstreams/new?project=`): link `+ New Meeting` di Project → Meetings tab →
`/meetings/new?project={id}`. Field Project ditampilkan **read-only + hidden input**
(§3: "Project locked/read-only"), bukan `<select>`.

### Tab Project Detail

`TABS` di `app/(app)/projects/[id]/page.tsx`:
```ts
overview | workstreams | tasks | meetings | activity | members | settings
```

### Sidebar

Tambah ke group `COLLABORATION` (sudah ada):
```ts
{ href: '/meetings', label: 'Meetings', permission: 'meetings.view' }
```
+ ikon SVG di `ICONS` (kalender).

### Meeting Detail — tab

Reuse `Tabs` (URL-based). Tab mobile scroll horizontal (§43):
`overflow-x-auto` + `whitespace-nowrap` di wrapper tab.

---

## 9. Partial Loading (PRD §44)

Tiap area punya Suspense sendiri; shell/sidebar/header tidak pernah ikut loading
(`app/(app)/layout.tsx` sudah melancholyat):

| Area | Boundary |
| --- | --- |
| KPI widget | Suspense + `SkeletonCards` |
| Tab | Suspense |
| Search + filter | Suspense (form terpisah, seperti `TaskFilterForm`) |
| List meeting | Suspense + `SkeletonRows` |
| Action Items | Suspense di dalam tab |
| Calendar sync status | Suspense |
| Dashboard widget | Suspense |

Query di-`cache()` per request (pola `fetchTaskLookups`) supaya tidak ada query
yang terulang antar-widget.

---

## 10. Scheduler (PRD §31, §32, §8) — **plan: HOBBY → pakai `pg_cron`**

### 10.1 Job

| Job | Kapan | `event_key` |
| --- | --- | --- |
| Meeting Reminder | 15 menit sebelum mulai | `meeting-reminder:<id>:<YYYY-MM-DD>` |
| Notes Reminder | 24 jam setelah `COMPLETED` + notes kosong | `meeting-notes:<id>:<YYYY-MM-DD>` |
| Calendar Sync | periodik (kalau Google terhubung) | `meeting-sync:<id>:<updated_at>` |

Idempotency dijamin mekanisme existing: `notification_events.event_key` PRIMARY KEY
→ insert kedua = error `23505` → `emitNotification()` return `emitted: false`
→ **1 notifikasi, 1 email**, walau cron jalan berulang (§32).

"Notes Reminder: one follow-up reminder" (§31) → hanya dikirim sekali per tanggal,
tidak ada pengulangan harian.

### 10.2 Timezone — perlu perhatian khusus

`todayISO()` sekarang = **UTC**. Untuk reminder 15 menit itu tidak bisa dipakai.
Rencana:
- `lib/utils/meeting-time.ts` baru dengan konstanta `APP_TIMEZONE` (default `Asia/Jakarta`)
- Hitung `now` dalam timezone itu, bandingkan dengan `meeting_date` + `start_time`
- **Tidak mengubah `todayISO()`** → perilaku overdue task tidak berubah sama sekali
  (proteksi §47)

### 10.3 Cron Hobby — sudah diputuskan

Dokumentasi Vercel: Hobby = 1×/hari, dan schedule yang lebih sering **gagal deploy**.
Owner sudah konfirmasi plan = **Hobby** ⇒ `vercel.json` **tidak** disentuh untuk
reminder meeting. Cron harian `/api/cron/deadlines` yang sudah ada tetap di Vercel
(sah di Hobby).

| Plan | Solusi | Dipakai? |
| --- | --- | --- |
| Pro/Enterprise | `vercel.json` → `{ path: "/api/cron/meetings", schedule: "*/15 * * * *" }` | tidak |
| **Hobby** | **Supabase `pg_cron` + `pg_net`** → POST ke `/api/cron/meetings` tiap 15 menit dengan header `Bearer CRON_SECRET` | **YA** |

Route `/api/cron/meetings` tetap dibuat dengan kontrak yang sama persis
(`GET` + `Bearer CRON_SECRET`, 401 kalau tidak cocok) — jadi kalau nanti plan
naik ke Pro, cukup pindahkan jadwal ke `vercel.json` tanpa mengubah kode.
SQL untuk didaftarkan owner: **§10.4**.

---

## 11. Google Calendar (§25–§30) — **KEPUTUSAN: Opsi A (foundation)**

PRD §52 menyebut Phase 11 = "Meeting Core + Scheduler + **Google Calendar Foundation**".
Owner memilih **Opsi A** (lihat §14 poin 2): fondasi penuh dikerjakan, OAuth ditunda.
Rinciannya:

### Opsi A — Foundation (DIPILIH)
Yang dikerjakan sekarang:
- Semua kolom `google_*` + state machine `google_sync_status`
- Checkbox `☑ Add to Google Calendar` di form create
- `Settings → Integrations → Google Calendar` dengan 4 state (§26) + Connect/Disconnect/Sync Now/Retry (UI-nya, tombol memberi pesan jelas kalau belum dikonfigurasi)
- `lib/google-calendar/service.ts` — interface + mapping (§28) + alur fail-safe (§27, Rule 7)
- Badge status sync + tombol Retry di Meeting Detail
- `lib/db/schema.ts` diperbarui (Drizzle) → **0 drift** dijaga

Yang **tidak** dikerjakan: OAuth flow, create/update/cancel event sungguhan.

### Opsi B — OAuth penuh sekarang — DITUNDA (follow-up Phase 12)
Butuh credential dari owner. Cara mendapatkannya: **§14.1**.
Biaya tambah nanti: ±1–2 hari kerja + 4 file baru + 1 tabel
(`google_calendar_connections` terpisah tanpa RLS — PRD §28 melarang kredensial
OAuth disimpan di meeting record).

### Opsi C — Tidak ada Google sama sekali di Phase 11
Ditolak — acceptance §"Google Calendar" (§46) tidak terpenuhi.

---

## 12. urutan pengerjaan (mengikuti PRD §49)

| # | Bucket | Isi | Commit |
| --- | --- | --- | --- |
| 1 | DB model | `008_meetings.sql` + update `lib/db/schema.ts` → `No schema changes` | 1 |
| 2 | Permission + types | `permissions.ts`, `types/meeting.ts`, `types/notification.ts`, activity enum | 1 |
| 3 | Data layer | `lib/data/meetings.ts` (scope cache, list, detail) + `lib/utils/meeting-time.ts` | 1 |
| 4 | Server action | `app/actions/meetings.ts` (CRUD, lifecycle, participants) | 1 |
| 5 | Global dashboard | `/meetings` + KPI + 5 tab + filter (partial loading) | 1 |
| 6 | Create global | `/meetings/new` | 1 |
| 7 | Project context | Tab Meetings + `?project=` terkunci | 1 |
| 8 | Meeting detail | Workspace 6 tab: overview/agenda/notes/decisions/actions/activity | 1 |
| 9 | Action Items + Task | `createTaskFromActionItem` idempotent + SOURCE di Task Detail | 1 |
| 10 | Activity + notification | Enum + emit di semua mutasi | 1 |
| 11 | Scheduler | `lib/meetings/scheduler.ts` + `/api/cron/meetings` | 1 |
| 12 | Settings Integrations | Section Google Calendar (4 state, Opsi A) | 1 |
| 13 | ~~Google OAuth~~ | **DILEWATI** — Opsi A (lihat §14). Jadi follow-up Phase 12 | 0 |
| 14 | Regression | `lint` + `build` + cek route production | 1 |
| 15 | Laporan | `docs/completion-report-phase11-meetings.md` | 1 |

Setiap langkah = 1 commit + push. Tidak ada rewrite besar (§49).

> **Bucket 1 butuh tindakan owner**: migrasi `008_meetings.sql` harus dijalankan
> manual di Supabase → SQL Editor (service role key tidak bisa menjalankan DDL).
> File-nya saya siapkan lengkap dengan komentar, tinggal di-paste. Setelah itu saya
> verifikasi lewat OpenAPI (`/rest/v1/`) bahwa 15 tabel sudah sesuai.

---

## 13. Yang TIDAK akan diubah (proteksi §47)

- `app/actions/tasks.ts` — hanya ditambah blok SOURCE di UI, logic tidak disentuh
- `lib/notifications/service.ts` — tidak berubah sama sekali
- `lib/activity-log/service.ts` — hanya enum
- `lib/utils/dates.ts` (`todayISO`) — tidak berubah
- Semua tabel & logic Phase 1–10
- Password/invite flow, email policy, deadline cron

---


## 14. Keputusan owner (SUDAH JAWAB — 4 Oktober 2026)

| # | Pertanyaan | Keputusan |
| --- | --- | --- |
| 1 | Vercel plan | **HOBBY** → scheduler reminder 15 menit wajib pakai **Supabase `pg_cron` + `pg_net`** (bukan `vercel.json`). Cron harian deadline tetap di Vercel (1×/hari sah di Hobby). |
| 2 | Google Calendar | Opsi **A (foundation)** untuk Phase 11. OAuth penuh ditunda, credential menyusul. |
| 3 | Notes | **Plain text multi-baris** + `whitespace-pre-wrap`. Tidak menambah dependency rich-text. |
| 4 | Viewer create meeting | **TIDAK bisa.** Dijawab eksplisit lewat permission, bukan implisit. |

Konsekuensi ke rencana:

- **§10.3** → cron **tidak** ditambah ke `vercel.json`. Yang baru: panduan
  `pg_cron` (§10.4) + route `/api/cron/meetings` (kode identik untuk kedua cara).
- **§11** → Opsi A. Tidak perlu Client ID/Secret untuk Phase 11.
- **§12** → bucket 13 (Google OAuth) **tidak** dikerjakan di Phase 11; ditandai
  sebagai follow-up di laporan.

### 10.4 Setup `pg_cron` (Hobby) — owner jalankan sekali di Supabase SQL Editor

Jadwal dalam UTC; interval 15 menit tidak terpengaruh timezone.

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'meeting-reminders',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://task-management-system-jatc.vercel.app/api/cron/meetings',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer GANTI_DENGAN_CRON_SECRET_ANDA'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 10000
  );
  $$
);
```

Verifikasi: `select jobname, schedule, active from cron.job;`

> `CRON_SECRET` yang sama dengan yang sudah dipakai `/api/cron/deadlines`.
> `/api/cron/meetings` menolak request tanpa `Bearer` yang cocok (401), sama
> seperti route deadline.

### 14.1 Gesture Google Calendar (Phase 12 / lanjutan)

Owner **tidak perlu** credential ini untuk Phase 11. Kalau nanti mau OAuth penuh:

1. <https://console.cloud.google.com> → project baru → **APIs & Services** →
   **Library** → aktifkan **Google Calendar API**.
2. **OAuth consent screen** → tipe **External** → isi nama/email app → masukkan
   tiap email anggota tim sebagai **Test user** (data di DB memakai Gmail pribadi).
3. **Credentials** → **Create credentials** → **OAuth client ID** → tipe
   **Web application**:
   - *Authorized redirect URI*: `https://task-management-system-jatc.vercel.app/api/google/callback`
   - *Authorized JavaScript origins*: biarkan kosong (alur server-side murni)
4. **Client secret** dari halaman OAuth client tersebut.

**Dua hal yang perlu diketahui sebelum memutuskan lanjut:**

- Scope `calendar.events` termasuk **sensitive**. App yang memakainya wajib
  **OAuth Verification** Google sebelum bisa PUBLISH dengan status **In production**.
  Selama statusnya **Testing**, refresh token **kedaluwarsa dalam 7 hari** — dan
  itulah sebabnya PRD §26 sudah punya state *Connection Expired* + tombol
  *Reconnect*. Dua jalur: (a) tetap di Testing + siap reconnect berkala, atau
  (b) ajukan verifikasi Google (lama, sekitar 2–6 minggu, perlu bukti kepemilikan
  domain `kasuat.co`).
- Token **tidak boleh** disimpan di `meetings` (PRD §28). Rencana: tabel terpisah
  `google_calendar_connections` tanpa RLS (khusus service role).

---

## 15. Verifikasi yang akan dijalankan

| Cek | Cara |
| --- | --- |
| Migration | Jalankan `008_meetings.sql` di Supabase SQL Editor |
| Skema | `drizzle-kit generate` ulang → harus `No schema changes` |
| OpenAPI | Bandingkan 15 tabel dengan `/rest/v1/` |
| Type | `tsc --noEmit` bersih |
| Lint | `npm run lint` 0 error |
| Build | `npm run build` sukses |
| Regression | 14 route production: `/login` 200, route protected 307 |
| Query count | `/meetings` harus ≤ 5 query, bukan 8+ |