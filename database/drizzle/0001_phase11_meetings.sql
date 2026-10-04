-- ============================================================================
-- PHASE 11 - MEETING. JANGAN DIJALANKAN KE DATABASE PRODUCTION.
-- ============================================================================
-- File ini adalah bentuk SKEMA hasil generate Drizzle untuk Phase 11, dan
-- isinya SETARA dengan `database/migrations/008_meetings.sql` yang akan
-- kamu jalankan di Supabase SQL Editor.
--
-- Kenapa ada dua file untuk perubahan yang sama?
--   - `database/migrations/` = SQL yang kamu JALANKAN (sumber kebenaran riil).
--   - `database/drizzle/`   = snapshot skema + bentuk Drizzle dari perubahan
--     yang sama. File di sini dipakai sebagai BASELINE untuk generate
--     berikutnya, dan TIDAK pernah dieksekusi ke database.
--
-- Satu perbedaan yang disengaja: nama FK. Postgres menamai FK otomatis
-- `meetings_project_id_fkey`, Drizzle menamai
-- `meetings_project_id_projects_id_fk`. Tidak berpengaruh ke query, RLS,
-- atau aplikasi, dan kita memang tidak pernah menjalankan
-- `drizzle-kit migrate`/`pull` (dilarang, lihat README.md).
--
-- Cara mengubah skema ke depan:
--   1. edit lib/db/schema.ts
--   2. npm run db:generate  -> SQL di folder ini (REVIEW dulu)
--   3. salin jadi database/migrations/NNN_*.sql, jalankan via SQL Editor
--   4. npm run db:generate lagi -> harus "No schema changes" (bukti 0 drift)
-- ============================================================================
CREATE TABLE "meeting_action_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"meeting_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"assignee_id" uuid,
	"deadline" date,
	"priority" text,
	"status" text DEFAULT 'OPEN' NOT NULL,
	"task_id" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "meeting_action_items_title_check" CHECK (char_length(trim("meeting_action_items"."title")) > 0),
	CONSTRAINT "meeting_action_items_priority_check" CHECK ("meeting_action_items"."priority" is null or "meeting_action_items"."priority" in ('LOW','MEDIUM','HIGH')),
	CONSTRAINT "meeting_action_items_status_check" CHECK ("meeting_action_items"."status" in ('OPEN','IN_PROGRESS','DONE','DROPPED'))
);
--> statement-breakpoint
CREATE TABLE "meeting_agendas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"meeting_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"title" text NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "meeting_agendas_title_check" CHECK (char_length(trim("meeting_agendas"."title")) > 0)
);
--> statement-breakpoint
CREATE TABLE "meeting_decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"meeting_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"decision" text NOT NULL,
	"rationale" text,
	"decided_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "meeting_decisions_text_check" CHECK (char_length(trim("meeting_decisions"."decision")) > 0)
);
--> statement-breakpoint
CREATE TABLE "meeting_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"meeting_id" uuid NOT NULL,
	"user_id" uuid,
	"external_name" text,
	"external_email" text,
	"attendance" text DEFAULT 'PENDING' NOT NULL,
	"is_organizer" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "meeting_participants_user_unique" UNIQUE("meeting_id","user_id"),
	CONSTRAINT "meeting_participants_target_check" CHECK ("meeting_participants"."user_id" is not null or ("meeting_participants"."external_name" is not null and "meeting_participants"."external_email" is not null)),
	CONSTRAINT "meeting_participants_attendance_check" CHECK ("meeting_participants"."attendance" in ('PENDING','ACCEPTED','DECLINED','ATTENDED'))
);
--> statement-breakpoint
CREATE TABLE "meetings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text DEFAULT 'M-' || lpad(nextval('public.meeting_code_seq')::text, 3, '0') NOT NULL,
	"title" text NOT NULL,
	"project_id" uuid,
	"meeting_type" text DEFAULT 'INTERNAL_MEETING' NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"meeting_date" date NOT NULL,
	"start_time" time NOT NULL,
	"end_time" time NOT NULL,
	"location" text,
	"meeting_link" text,
	"description" text,
	"notes" text,
	"organizer_id" uuid,
	"created_by" uuid,
	"google_calendar_id" text,
	"google_calendar_event_id" text,
	"google_sync_status" text DEFAULT 'NOT_CONNECTED' NOT NULL,
	"google_sync_error" text,
	"google_last_synced_at" timestamp with time zone,
	"add_to_calendar" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "meetings_code_unique" UNIQUE("code"),
	CONSTRAINT "meetings_meeting_type_check" CHECK ("meetings"."meeting_type" in ('WEEKLY_PROJECT_REVIEW','PROJECT_KICKOFF','CLIENT_MEETING','INTERNAL_MEETING','OPERATIONAL_REVIEW','MANAGEMENT_REVIEW','AD_HOC','OTHER')),
	CONSTRAINT "meetings_status_check" CHECK ("meetings"."status" in ('DRAFT','SCHEDULED','COMPLETED','CANCELLED')),
	CONSTRAINT "meetings_google_sync_status_check" CHECK ("meetings"."google_sync_status" in ('NOT_CONNECTED','PENDING','SYNCED','FAILED','DISCONNECTED')),
	CONSTRAINT "meetings_title_check" CHECK (char_length(trim("meetings"."title")) > 0),
	CONSTRAINT "meetings_time_check" CHECK ("meetings"."end_time" > "meetings"."start_time"),
	CONSTRAINT "meetings_owner_check" CHECK ("meetings"."organizer_id" is not null or "meetings"."created_by" is not null)
);
--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD COLUMN "email_meeting_updates" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "source_type" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "source_id" uuid;--> statement-breakpoint
ALTER TABLE "meeting_action_items" ADD CONSTRAINT "meeting_action_items_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_action_items" ADD CONSTRAINT "meeting_action_items_assignee_id_profiles_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_action_items" ADD CONSTRAINT "meeting_action_items_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_action_items" ADD CONSTRAINT "meeting_action_items_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_agendas" ADD CONSTRAINT "meeting_agendas_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_decisions" ADD CONSTRAINT "meeting_decisions_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_decisions" ADD CONSTRAINT "meeting_decisions_decided_by_profiles_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_participants" ADD CONSTRAINT "meeting_participants_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_participants" ADD CONSTRAINT "meeting_participants_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_organizer_id_profiles_id_fk" FOREIGN KEY ("organizer_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "meeting_action_items_meeting_idx" ON "meeting_action_items" USING btree ("meeting_id","status");--> statement-breakpoint
CREATE INDEX "meeting_action_items_assignee_idx" ON "meeting_action_items" USING btree ("assignee_id") WHERE "meeting_action_items"."status" in ('OPEN','IN_PROGRESS');--> statement-breakpoint
CREATE INDEX "meeting_action_items_task_idx" ON "meeting_action_items" USING btree ("task_id") WHERE "meeting_action_items"."task_id" is not null;--> statement-breakpoint
CREATE INDEX "meeting_agendas_order_idx" ON "meeting_agendas" USING btree ("meeting_id","position");--> statement-breakpoint
CREATE INDEX "meeting_decisions_order_idx" ON "meeting_decisions" USING btree ("meeting_id","position");--> statement-breakpoint
CREATE INDEX "meeting_participants_user_idx" ON "meeting_participants" USING btree ("user_id","meeting_id");--> statement-breakpoint
CREATE INDEX "meetings_project_idx" ON "meetings" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "meetings_date_idx" ON "meetings" USING btree ("meeting_date");--> statement-breakpoint
CREATE INDEX "meetings_status_idx" ON "meetings" USING btree ("status");--> statement-breakpoint
CREATE INDEX "meetings_organizer_idx" ON "meetings" USING btree ("organizer_id");--> statement-breakpoint
CREATE INDEX "meetings_needs_notes_idx" ON "meetings" USING btree ("meeting_date") WHERE "meetings"."status" = 'COMPLETED' and coalesce(btrim("meetings"."notes"), '') = '';--> statement-breakpoint
CREATE INDEX "tasks_source_idx" ON "tasks" USING btree ("source_type","source_id") WHERE "tasks"."source_type" is not null;