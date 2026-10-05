/**
 * Skema database — Drizzle ORM (sumber kebenaran skema, tipe single-source).
 *
 * =====================================================================
 * ATURAN PENTING (baca sebelum mengubah file ini)
 * =====================================================================
 * 1. Skema ini MIRROR kondisi database production saat Phase 10 selesai.
 *    Sudah diverifikasi 1:1 terhadap OpenAPI PostgREST (10 tabel, 0 drift).
 * 2. Migrasi historis yang SUDAH TERJALAN ada di `database/migrations/`
 *    (001–007). File-file itu tetap riwayat resmi yang sudah dipakai.
 * 3. Drizzle-kit HANYA untuk perubahan SEJAK BASELINE:
 *      npm run db:generate  -> SQL di database/drizzle/ (harus direview)
 *    DILARANG `drizzle-kit push` (bisa drop kolom tanpa konfirmasi).
 * 4. `auth.users` hanya dideklarasikan sebagai TARGET foreign key milik
 *    Supabase (dibuat oleh Supabase, bukan oleh kita). Jangan migrasikan.
 * 5. Semua tulis tetap lewat service role + Server Action yang sudah
 *    mengecek role (lihat app/actions/*). RLS tetap reject write anon.
 *
 * Prinsip yang sama dengan Fase 1–9: ADDITIVE ONLY, satu sumber kebenaran.
 * =====================================================================
 */
import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgSchema,
  pgTable,
  primaryKey,
  text,
  time,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'

/* ------------------------------------------------------------------ */
/* auth.users — TUJUAN FK SAJA, tabel milik Supabase. Jangan dibuat.   */
/* ------------------------------------------------------------------ */
const auth = pgSchema('auth')

export const authUsers = auth.table('users', {
  id: uuid('id').primaryKey(),
})

/* ------------------------------------------------------------------ */
/* profiles                                                            */
/* ------------------------------------------------------------------ */
export const profiles = pgTable(
  'profiles',
  {
    id: uuid('id')
      .primaryKey()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    full_name: text('full_name'),
    email: text('email').notNull(),
    /** ADMIN | PROJECT_MANAGER | TEAM_MEMBER | VIEWER */
    role: text('role').notNull().default('TEAM_MEMBER'),
    created_at: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
    /** INVITED | ACTIVE | INACTIVE — SATU-SATUNYA sumber kebenaran. */
    status: text('status').notNull().default('INVITED'),
    /**
     * Kolom GENERATED dari `status`._read-only di DB (tidak bisa ditulis,
     * hanya dibaca). Jangan pernah dipakai sebagai sumber kebenaran —
     * itu pelajaran dari Phase 2 (is_active vs status).
     */
    is_active: boolean('is_active').generatedAlwaysAs(sql`status = 'ACTIVE'`),
  },
  (t) => [
    check(
      'profiles_role_check',
      sql`${t.role} in ('ADMIN', 'PROJECT_MANAGER', 'TEAM_MEMBER', 'VIEWER')`
    ),
    check('profiles_status_check', sql`${t.status} in ('INVITED', 'ACTIVE', 'INACTIVE')`),
    // Nama constraint Disamakan dengan DB (dari `email text unique`).
    unique('profiles_email_key').on(t.email),
  ]
)

/* ------------------------------------------------------------------ */
/* projects                                                            */
/* ------------------------------------------------------------------ */
export const projects = pgTable(
  'projects',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    /** Kode readable "001", "002", ... (dari sequence). */
    code: text('code')
      .notNull()
      .unique()
      .default(sql`lpad(nextval('public.project_code_seq')::text, 3, '0')`),
    name: text('name').notNull(),
    client: text('client'),
    description: text('description'),
    start_date: date('start_date', { mode: 'string' }),
    end_date: date('end_date', { mode: 'string' }),
    /** PLANNING | ACTIVE | ON_HOLD | COMPLETED | CANCELLED */
    status: text('status').notNull().default('PLANNING'),
    created_at: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check(
      'projects_status_check',
      sql`${t.status} in ('PLANNING', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED')`
    ),
    check(
      'projects_dates_check',
      sql`${t.end_date} is null or ${t.start_date} is null or ${t.end_date} >= ${t.start_date}`
    ),
  ]
)

/* ------------------------------------------------------------------ */
/* workstreams                                                         */
/* ------------------------------------------------------------------ */
export const workstreams = pgTable(
  'workstreams',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    project_id: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'restrict' }),
    /** Huruf per project: "A", "B", ... (diisi trigger). */
    code: text('code').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    created_at: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique('workstreams_project_code_unique').on(t.project_id, t.code),
    index('workstreams_project_idx').on(t.project_id),
  ]
)

/* ------------------------------------------------------------------ */
/* project_managers (multi-PM — kolom projects.project_manager_id        */
/* sudah dihapus di 004; tabel relasi ini satu-satunya sumber)        */
/* ------------------------------------------------------------------ */
export const projectManagers = pgTable(
  'project_managers',
  {
    project_id: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    user_id: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    created_at: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.project_id, t.user_id] }),
    index('project_managers_user_idx').on(t.user_id),
  ]
)

/* ------------------------------------------------------------------ */
/* tasks                                                               */
/* ------------------------------------------------------------------ */
export const tasks = pgTable(
  'tasks',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    /** Kode readable "T-01" (dari sequence). */
    code: text('code')
      .notNull()
      .unique()
      .default(sql`'T-' || lpad(nextval('public.task_code_seq')::text, 2, '0')`),
    project_id: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'restrict' }),
    workstream_id: uuid('workstream_id').references(() => workstreams.id, {
      onDelete: 'set null',
    }),
    title: text('title').notNull(),
    description: text('description'),
    assignee_id: uuid('assignee_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'restrict' }),
    created_by: uuid('created_by').references(() => profiles.id, { onDelete: 'set null' }),
    /** LOW | MEDIUM | HIGH */
    priority: text('priority').notNull().default('MEDIUM'),
    /** TODO | IN_PROGRESS | REVIEW | BLOCKED | DONE */
    status: text('status').notNull().default('TODO'),
    start_date: date('start_date', { mode: 'string' }),
    deadline: date('deadline', { mode: 'string' }).notNull(),
    /** Soft delete. Semua list wajib filter `is_deleted = false`. */
    is_deleted: boolean('is_deleted').notNull().default(false),
    /** Link bukti (opsional, tetap bisa diubah setelah DONE). */
    evidence_url: text('evidence_url'),
    /**
     * Phase 11 traceability (§21): task tahu dari mana dia berasal.
     * Polymorphic pointer — TIDAK punya FK, karena `source_id` bisa
     * menunjuk tabel berbeda (meetings / task_suggestions / import).
     * Validasi dilakukan di Server Action.
     */
    source_type: text('source_type'),
    source_id: uuid('source_id'),
    created_at: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check('tasks_priority_check', sql`${t.priority} in ('LOW', 'MEDIUM', 'HIGH')`),
    check(
      'tasks_status_check',
      sql`${t.status} in ('TODO', 'IN_PROGRESS', 'REVIEW', 'BLOCKED', 'DONE')`
    ),
    check('tasks_title_check', sql`char_length(trim(${t.title})) > 0`),
    check('tasks_dates_check', sql`${t.start_date} is null or ${t.deadline} >= ${t.start_date}`),
    index('tasks_project_idx').on(t.project_id).where(sql`${t.is_deleted} = false`),
    index('tasks_assignee_idx').on(t.assignee_id).where(sql`${t.is_deleted} = false`),
    index('tasks_deadline_idx').on(t.deadline).where(sql`${t.is_deleted} = false`),
    // Phase 11: lookup task yang berasal dari meeting/suggestion.
    index('tasks_source_idx').on(t.source_type, t.source_id).where(sql`${t.source_type} is not null`),
  ]
)

/* ------------------------------------------------------------------ */
/* task_suggestions                                                    */
/* ------------------------------------------------------------------ */
export const taskSuggestions = pgTable(
  'task_suggestions',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    /** Kode readable "S-001" (dari sequence). */
    code: text('code')
      .notNull()
      .default(sql`'S-' || lpad(nextval('public.suggestion_code_seq')::text, 3, '0')`),
    title: text('title').notNull(),
    description: text('description').notNull(),
    project_id: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'restrict' }),
    workstream_id: uuid('workstream_id').references(() => workstreams.id, {
      onDelete: 'set null',
    }),
    suggested_assignee_id: uuid('suggested_assignee_id').references(() => profiles.id, {
      onDelete: 'set null',
    }),
    suggested_priority: text('suggested_priority'),
    suggested_deadline: date('suggested_deadline', { mode: 'string' }),
    suggested_by: uuid('suggested_by')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    reviewer_id: uuid('reviewer_id').references(() => profiles.id, { onDelete: 'set null' }),
    review_note: text('review_note'),
    /** PENDING | APPROVED | REVISION_REQUESTED | REJECTED | CONVERTED */
    status: text('status').notNull().default('PENDING'),
    converted_task_id: uuid('converted_task_id').references(() => tasks.id, {
      onDelete: 'set null',
    }),
    reviewed_at: timestamp('reviewed_at', { withTimezone: true, mode: 'string' }),
    created_at: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique('suggestions_code_unique').on(t.code),
    check(
      'suggestions_priority_check',
      sql`${t.suggested_priority} is null or ${t.suggested_priority} in ('LOW', 'MEDIUM', 'HIGH')`
    ),
    check(
      'suggestions_status_check',
      sql`${t.status} in ('PENDING', 'APPROVED', 'REVISION_REQUESTED', 'REJECTED', 'CONVERTED')`
    ),
    check('suggestions_title_check', sql`char_length(trim(${t.title})) > 0`),
    check('suggestions_desc_check', sql`char_length(trim(${t.description})) > 0`),
    index('suggestions_project_idx').on(t.project_id),
    index('suggestions_by_idx').on(t.suggested_by),
    index('suggestions_status_idx').on(t.status),
  ]
)

/* ------------------------------------------------------------------ */
/* notifications (in-app)                                              */
/* ------------------------------------------------------------------ */
export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    user_id: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    title: text('title').notNull(),
    message: text('message').notNull().default(''),
    entity_type: text('entity_type').notNull().default(''),
    entity_id: text('entity_id').notNull().default(''),
    is_read: boolean('is_read').notNull().default(false),
    created_at: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
    read_at: timestamp('read_at', { withTimezone: true, mode: 'string' }),
  },
  (t) => [
    index('notifications_user_idx').on(t.user_id, t.created_at),
    index('notifications_unread_idx').on(t.user_id).where(sql`${t.is_read} = false`),
  ]
)

/* ------------------------------------------------------------------ */
/* notification_events — idempotency: satu event = satu pengiriman.     */
/* TIDAK punya policy RLS sama sekali (khusus service role).            */
/* ------------------------------------------------------------------ */
export const notificationEvents = pgTable('notification_events', {
  event_key: text('event_key').primaryKey(),
  created_at: timestamp('created_at', { withTimezone: true, mode: 'string' })
    .notNull()
    .defaultNow(),
})

/* ------------------------------------------------------------------ */
/* notification_preferences — satu baris per user, default ON semua.    */
/* ------------------------------------------------------------------ */
export const notificationPreferences = pgTable('notification_preferences', {
  user_id: uuid('user_id')
    .primaryKey()
    .references(() => profiles.id, { onDelete: 'cascade' }),
  email_enabled: boolean('email_enabled').notNull().default(true),
  email_task_updates: boolean('email_task_updates').notNull().default(true),
  email_suggestion_updates: boolean('email_suggestion_updates').notNull().default(true),
  email_deadline_alerts: boolean('email_deadline_alerts').notNull().default(true),
  /** Phase 11 update: Morning Digest harian (migrasi 009). */
  email_digest_daily: boolean('email_digest_daily').notNull().default(true),
  /** Phase 11: email meeting mengikuti preferensi sendiri (§24). */
  email_meeting_updates: boolean('email_meeting_updates').notNull().default(true),
  updated_at: timestamp('updated_at', { withTimezone: true, mode: 'string' })
    .notNull()
    .defaultNow(),
})

/* ------------------------------------------------------------------ */
/* activity_logs — APPEND-ONLY, hanya service role yang menulis.        */
/* ------------------------------------------------------------------ */
export const activityLogs = pgTable(
  'activity_logs',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    actor_user_id: uuid('actor_user_id').references(() => profiles.id, {
      onDelete: 'set null',
    }),
    /** USER | SYSTEM (mis. cron deadline reminder) */
    actor_type: text('actor_type').notNull().default('USER'),
    action: text('action').notNull(),
    entity_type: text('entity_type').notNull().default(''),
    entity_id: text('entity_id').notNull().default(''),
    entity_code: text('entity_code').notNull().default(''),
    project_id: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
    /** Secret sudah di-strip sebelum ditulis (lib/activity-log/service.ts). */
    metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
    request_id: text('request_id'),
    created_at: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check('activity_actor_type_check', sql`${t.actor_type} in ('USER', 'SYSTEM')`),
    index('activity_entity_idx').on(t.entity_type, t.entity_id, t.created_at),
    index('activity_actor_idx').on(t.actor_user_id, t.created_at),
    index('activity_project_idx').on(t.project_id, t.created_at),
    index('activity_created_idx').on(t.created_at),
  ]
)

/* ==================================================================== */
/* PHASE 11 — MEETING                                                    */
/* ==================================================================== */
/* Migrasi: database/migrations/008_meetings.sql                        */
/*                                                                    */
/* Prinsip:                                                            */
/* - Kasuat yang punya Meeting. Google Calendar hanya sync layer        */
/*   (PRD §25, Rule 1 & 2). Token OAuth TIDAK disimpan di tabel ini    */
/*   (§28) — tempatnya `google_calendar_connections` terpisah.          */
/* - "Meeting butuh notes" DITURUNKAN dari isi kolom `notes`. Tidak ada */
/*   kolom notes_status yang bisa berbeda dari isi notes — itu          */
/*   pelajaran Phase 2 (is_active vs status).                           */
/* - Akses baca(scoped) di levelsatu fungsi: can_read_meeting().        */
/*   Dipakai policy RLS meetings + semua tabel anaknya.                */
/* ==================================================================== */

/* ------------------------------------------------------------------ */
/* meetings                                                            */
/* ------------------------------------------------------------------ */
export const meetings = pgTable(
  'meetings',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    /** Kode readable "M-001" (dari sequence). */
    code: text('code')
      .notNull()
      .unique()
      .default(sql`'M-' || lpad(nextval('public.meeting_code_seq')::text, 3, '0')`),
    title: text('title').notNull(),
    /** NULLABLE by design: meeting global tidak wajib punya project. */
    project_id: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
    meeting_type: text('meeting_type').notNull().default('INTERNAL_MEETING'),
    /** DRAFT | SCHEDULED | COMPLETED | CANCELLED */
    status: text('status').notNull().default('DRAFT'),
    meeting_date: date('meeting_date', { mode: 'string' }).notNull(),
    /** Waktu lokal (Asia/Jakarta) — tanpa timezone, lihat lib/utils/meeting-time.ts */
    start_time: time('start_time', { withTimezone: false }).notNull(),
    end_time: time('end_time', { withTimezone: false }).notNull(),
    location: text('location'),
    meeting_link: text('meeting_link'),
    description: text('description'),
    /** SATU-SATUNYA sumber kebenaran "notes sudah belum". */
    notes: text('notes'),
    /** Pemangku meeting. Boleh berbeda dari yang membuat (§38). */
    organizer_id: uuid('organizer_id').references(() => profiles.id, { onDelete: 'set null' }),
    created_by: uuid('created_by').references(() => profiles.id, { onDelete: 'set null' }),
    /* --- Google Calendar metadata (BUKAN token) --- */
    google_calendar_id: text('google_calendar_id'),
    google_calendar_event_id: text('google_calendar_event_id'),
    /** NOT_CONNECTED | PENDING | SYNCED | FAILED | DISCONNECTED */
    google_sync_status: text('google_sync_status').notNull().default('NOT_CONNECTED'),
    google_sync_error: text('google_sync_error'),
    google_last_synced_at: timestamp('google_last_synced_at', {
      withTimezone: true,
      mode: 'string',
    }),
    /** Checkbox "Add to Google Calendar" di form create (§27). */
    add_to_calendar: boolean('add_to_calendar').notNull().default(false),
    created_at: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check(
      'meetings_meeting_type_check',
      sql`${t.meeting_type} in ('WEEKLY_PROJECT_REVIEW','PROJECT_KICKOFF','CLIENT_MEETING','INTERNAL_MEETING','OPERATIONAL_REVIEW','MANAGEMENT_REVIEW','AD_HOC','OTHER')`
    ),
    check(
      'meetings_status_check',
      sql`${t.status} in ('DRAFT','SCHEDULED','COMPLETED','CANCELLED')`
    ),
    check(
      'meetings_google_sync_status_check',
      sql`${t.google_sync_status} in ('NOT_CONNECTED','PENDING','SYNCED','FAILED','DISCONNECTED')`
    ),
    check('meetings_title_check', sql`char_length(trim(${t.title})) > 0`),
    check('meetings_time_check', sql`${t.end_time} > ${t.start_time}`),
    // Meeting wajib ada pemiliknya (organizer atau pembuat).
    check(
      'meetings_owner_check',
      sql`${t.organizer_id} is not null or ${t.created_by} is not null`
    ),
    index('meetings_project_idx').on(t.project_id),
    index('meetings_date_idx').on(t.meeting_date),
    index('meetings_status_idx').on(t.status),
    index('meetings_organizer_idx').on(t.organizer_id),
    // Needs Notes queue (§36): hanya baris yang butuh tindakan.
    // Ekspresi ini HARUS sama dengan definisi "needs notes" di query.
    index('meetings_needs_notes_idx')
      .on(t.meeting_date)
      .where(sql`${t.status} = 'COMPLETED' and coalesce(btrim(${t.notes}), '') = ''`),
  ]
)

/* ------------------------------------------------------------------ */
/* meeting_participants                                                */
/* ------------------------------------------------------------------ */
export const meetingParticipants = pgTable(
  'meeting_participants',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    meeting_id: uuid('meeting_id')
      .notNull()
      .references(() => meetings.id, { onDelete: 'cascade' }),
    /** Peserta internal (Kasuat user). */
    user_id: uuid('user_id').references(() => profiles.id, { onDelete: 'cascade' }),
    /** Peserta eksternal — siap untuk client meeting (§39). */
    external_name: text('external_name'),
    external_email: text('external_email'),
    /** PENDING | ACCEPTED | DECLINED | ATTENDED */
    attendance: text('attendance').notNull().default('PENDING'),
    is_organizer: boolean('is_organizer').notNull().default(false),
    created_at: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique('meeting_participants_user_unique').on(t.meeting_id, t.user_id),
    // Internal ATAU eksternal — minimal salah satu harus ada.
    check(
      'meeting_participants_target_check',
      sql`${t.user_id} is not null or (${t.external_name} is not null and ${t.external_email} is not null)`
    ),
    check(
      'meeting_participants_attendance_check',
      sql`${t.attendance} in ('PENDING','ACCEPTED','DECLINED','ATTENDED')`
    ),
    // (meeting_id, user_id) unique sudah melayani lookup per meeting.
    index('meeting_participants_user_idx').on(t.user_id, t.meeting_id),
  ]
)

/* ------------------------------------------------------------------ */
/* meeting_agendas (§16) — daftar terstruktur, reorder = update position */
/* ------------------------------------------------------------------ */
export const meetingAgendas = pgTable(
  'meeting_agendas',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    meeting_id: uuid('meeting_id')
      .notNull()
      .references(() => meetings.id, { onDelete: 'cascade' }),
    position: integer('position').notNull().default(0),
    title: text('title').notNull(),
    notes: text('notes'),
    created_at: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check('meeting_agendas_title_check', sql`char_length(trim(${t.title})) > 0`),
    index('meeting_agendas_order_idx').on(t.meeting_id, t.position),
  ]
)

/* ------------------------------------------------------------------ */
/* meeting_decisions (§18) — tiap item bisa diedit individual           */
/* ------------------------------------------------------------------ */
export const meetingDecisions = pgTable(
  'meeting_decisions',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    meeting_id: uuid('meeting_id')
      .notNull()
      .references(() => meetings.id, { onDelete: 'cascade' }),
    position: integer('position').notNull().default(0),
    decision: text('decision').notNull(),
    rationale: text('rationale'),
    decided_by: uuid('decided_by').references(() => profiles.id, { onDelete: 'set null' }),
    created_at: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check('meeting_decisions_text_check', sql`char_length(trim(${t.decision})) > 0`),
    index('meeting_decisions_order_idx').on(t.meeting_id, t.position),
  ]
)

/* ------------------------------------------------------------------ */
/* meeting_action_items (§19, §22)                                      */
/* ------------------------------------------------------------------ */
export const meetingActionItems = pgTable(
  'meeting_action_items',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    meeting_id: uuid('meeting_id')
      .notNull()
      .references(() => meetings.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description'),
    assignee_id: uuid('assignee_id').references(() => profiles.id, { onDelete: 'set null' }),
    deadline: date('deadline', { mode: 'string' }),
    /** LOW | MEDIUM | HIGH (opsional — default-nya MEDIUM saat jadi task) */
    priority: text('priority'),
    /** OPEN | IN_PROGRESS | DONE | DROPPED (bukan status task) */
    status: text('status').notNull().default('OPEN'),
    /**
     * Link ke task (§21) DAN idempotency guard (§22):
     * kalau sudah terisi, Create Task kedua tidak boleh membuat task baru.
     */
    task_id: uuid('task_id').references(() => tasks.id, { onDelete: 'set null' }),
    created_by: uuid('created_by').references(() => profiles.id, { onDelete: 'set null' }),
    created_at: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check('meeting_action_items_title_check', sql`char_length(trim(${t.title})) > 0`),
    check(
      'meeting_action_items_priority_check',
      sql`${t.priority} is null or ${t.priority} in ('LOW','MEDIUM','HIGH')`
    ),
    check(
      'meeting_action_items_status_check',
      sql`${t.status} in ('OPEN','IN_PROGRESS','DONE','DROPPED')`
    ),
    index('meeting_action_items_meeting_idx').on(t.meeting_id, t.status),
    index('meeting_action_items_assignee_idx')
      .on(t.assignee_id)
      .where(sql`${t.status} in ('OPEN','IN_PROGRESS')`),
    // Link balik Meeting -> T-081 cepat.
    index('meeting_action_items_task_idx')
      .on(t.task_id)
      .where(sql`${t.task_id} is not null`),
  ]
)

/* ------------------------------------------------------------------ */
/* Tipe turunan — inilah gunanya ORM: SELECT kolom jadi type-safe,    */
/* tanpa menulis shape + `as` manual di 164 call site.                 */
/* ------------------------------------------------------------------ */
export type Profile = typeof profiles.$inferSelect
export type NewProfile = typeof profiles.$inferInsert
export type Project = typeof projects.$inferSelect
export type NewProject = typeof projects.$inferInsert
export type Workstream = typeof workstreams.$inferSelect
export type NewWorkstream = typeof workstreams.$inferInsert
export type Task = typeof tasks.$inferSelect
export type NewTask = typeof tasks.$inferInsert
export type TaskSuggestion = typeof taskSuggestions.$inferSelect
export type NewTaskSuggestion = typeof taskSuggestions.$inferInsert
export type Notification = typeof notifications.$inferSelect
export type NotificationEvent = typeof notificationEvents.$inferSelect
export type NotificationPreference = typeof notificationPreferences.$inferSelect
export type ActivityLog = typeof activityLogs.$inferSelect
export type ProjectManager = typeof projectManagers.$inferSelect
export type Meeting = typeof meetings.$inferSelect
export type NewMeeting = typeof meetings.$inferInsert
export type MeetingParticipant = typeof meetingParticipants.$inferSelect
export type MeetingAgenda = typeof meetingAgendas.$inferSelect
export type MeetingDecision = typeof meetingDecisions.$inferSelect
export type MeetingActionItem = typeof meetingActionItems.$inferSelect
export type NewMeetingActionItem = typeof meetingActionItems.$inferInsert

/** Union dari nilai enum yang di-check di DB (drizzle tidak bisa baca CHECK). */
export type ProfileRole = 'ADMIN' | 'PROJECT_MANAGER' | 'TEAM_MEMBER' | 'VIEWER'
export type ProfileStatus = 'INVITED' | 'ACTIVE' | 'INACTIVE'
export type ProjectStatus = 'PLANNING' | 'ACTIVE' | 'ON_HOLD' | 'COMPLETED' | 'CANCELLED'
export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH'
export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'REVIEW' | 'BLOCKED' | 'DONE'
export type SuggestionStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'REVISION_REQUESTED'
  | 'REJECTED'
  | 'CONVERTED'
export type ActorType = 'USER' | 'SYSTEM'

/* --- Phase 11 --- */
export type MeetingType =
  | 'WEEKLY_PROJECT_REVIEW'
  | 'PROJECT_KICKOFF'
  | 'CLIENT_MEETING'
  | 'INTERNAL_MEETING'
  | 'OPERATIONAL_REVIEW'
  | 'MANAGEMENT_REVIEW'
  | 'AD_HOC'
  | 'OTHER'
/** Lifecycle §13: DRAFT → SCHEDULED → COMPLETED, SCHEDULED → CANCELLED */
export type MeetingStatus = 'DRAFT' | 'SCHEDULED' | 'COMPLETED' | 'CANCELLED'
export type MeetingAttendance = 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'ATTENDED'
export type MeetingActionItemStatus = 'OPEN' | 'IN_PROGRESS' | 'DONE' | 'DROPPED'
export type GoogleSyncStatus =
  | 'NOT_CONNECTED'
  | 'PENDING'
  | 'SYNCED'
  | 'FAILED'
  | 'DISCONNECTED'
/** Sumber traceability task (§21) */
export type TaskSourceType = 'MEETING' | 'SUGGESTION' | 'IMPORT'

/**
 * Status enum per tabel. Dipakai untuk filter query (bukan hanya badge di UI),
 * supaya tidak ada string yang diketik ulang di banyak tempat.
 */
export const MEETING_TYPES: MeetingType[] = [
  'WEEKLY_PROJECT_REVIEW',
  'PROJECT_KICKOFF',
  'CLIENT_MEETING',
  'INTERNAL_MEETING',
  'OPERATIONAL_REVIEW',
  'MANAGEMENT_REVIEW',
  'AD_HOC',
  'OTHER',
]
export const MEETING_STATUSES: MeetingStatus[] = [
  'DRAFT',
  'SCHEDULED',
  'COMPLETED',
  'CANCELLED',
]
export const ACTION_ITEM_STATUSES: MeetingActionItemStatus[] = [
  'OPEN',
  'IN_PROGRESS',
  'DONE',
  'DROPPED',
]