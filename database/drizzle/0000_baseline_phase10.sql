-- ============================================================================
-- BASELINE SKEMA — JANGAN PERNAH DIJALANKAN KE DATABASE PRODUCTION.
-- ============================================================================
-- File ini DOKUMENTASI skema saat ini (mirror dari DB live, 10 tabel,
-- sudah diverifikasi 0 drift: `drizzle-kit generate` ulang -> "No schema
-- changes, nothing to migrate").
--
-- File ini sengaja tidak dieksekusi ke production karena:
--   1. Semua tabel sudah ada di sana (jadi akan conflict).
--   2. Contains auth.users — a table created by Supabase, not us.
--   3. Sequences (project_code_seq, task_code_seq, suggestion_code_seq)
--      dibuat oleh database/migrations/005_human_readable_codes.sql.
--
-- Cara benar untuk perubahan skema ke depan:
--   1. edit lib/db/schema.ts
--   2. npm run db:generate  -> SQL baru di folder ini
--   3. REVIEW manual, lalu jalankan lewat Supabase SQL Editor
--   4. DILARANG drizzle-kit push (bisa DROP kolom tanpa konfirmasi)
-- ============================================================================
CREATE TABLE "activity_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid,
	"actor_type" text DEFAULT 'USER' NOT NULL,
	"action" text NOT NULL,
	"entity_type" text DEFAULT '' NOT NULL,
	"entity_id" text DEFAULT '' NOT NULL,
	"entity_code" text DEFAULT '' NOT NULL,
	"project_id" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"request_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "activity_actor_type_check" CHECK ("activity_logs"."actor_type" in ('USER', 'SYSTEM'))
);
--> statement-breakpoint
CREATE TABLE "auth"."users" (
	"id" uuid PRIMARY KEY NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_events" (
	"event_key" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_preferences" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"email_enabled" boolean DEFAULT true NOT NULL,
	"email_task_updates" boolean DEFAULT true NOT NULL,
	"email_suggestion_updates" boolean DEFAULT true NOT NULL,
	"email_deadline_alerts" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"message" text DEFAULT '' NOT NULL,
	"entity_type" text DEFAULT '' NOT NULL,
	"entity_id" text DEFAULT '' NOT NULL,
	"is_read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"full_name" text,
	"email" text NOT NULL,
	"role" text DEFAULT 'TEAM_MEMBER' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" text DEFAULT 'INVITED' NOT NULL,
	"is_active" boolean GENERATED ALWAYS AS (status = 'ACTIVE') STORED,
	CONSTRAINT "profiles_email_key" UNIQUE("email"),
	CONSTRAINT "profiles_role_check" CHECK ("profiles"."role" in ('ADMIN', 'PROJECT_MANAGER', 'TEAM_MEMBER', 'VIEWER')),
	CONSTRAINT "profiles_status_check" CHECK ("profiles"."status" in ('INVITED', 'ACTIVE', 'INACTIVE'))
);
--> statement-breakpoint
CREATE TABLE "project_managers" (
	"project_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_managers_project_id_user_id_pk" PRIMARY KEY("project_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text DEFAULT lpad(nextval('public.project_code_seq')::text, 3, '0') NOT NULL,
	"name" text NOT NULL,
	"client" text,
	"description" text,
	"start_date" date,
	"end_date" date,
	"status" text DEFAULT 'PLANNING' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "projects_code_unique" UNIQUE("code"),
	CONSTRAINT "projects_status_check" CHECK ("projects"."status" in ('PLANNING', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED')),
	CONSTRAINT "projects_dates_check" CHECK ("projects"."end_date" is null or "projects"."start_date" is null or "projects"."end_date" >= "projects"."start_date")
);
--> statement-breakpoint
CREATE TABLE "task_suggestions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text DEFAULT 'S-' || lpad(nextval('public.suggestion_code_seq')::text, 3, '0') NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"project_id" uuid NOT NULL,
	"workstream_id" uuid,
	"suggested_assignee_id" uuid,
	"suggested_priority" text,
	"suggested_deadline" date,
	"suggested_by" uuid NOT NULL,
	"reviewer_id" uuid,
	"review_note" text,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"converted_task_id" uuid,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "suggestions_code_unique" UNIQUE("code"),
	CONSTRAINT "suggestions_priority_check" CHECK ("task_suggestions"."suggested_priority" is null or "task_suggestions"."suggested_priority" in ('LOW', 'MEDIUM', 'HIGH')),
	CONSTRAINT "suggestions_status_check" CHECK ("task_suggestions"."status" in ('PENDING', 'APPROVED', 'REVISION_REQUESTED', 'REJECTED', 'CONVERTED')),
	CONSTRAINT "suggestions_title_check" CHECK (char_length(trim("task_suggestions"."title")) > 0),
	CONSTRAINT "suggestions_desc_check" CHECK (char_length(trim("task_suggestions"."description")) > 0)
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text DEFAULT 'T-' || lpad(nextval('public.task_code_seq')::text, 2, '0') NOT NULL,
	"project_id" uuid NOT NULL,
	"workstream_id" uuid,
	"title" text NOT NULL,
	"description" text,
	"assignee_id" uuid NOT NULL,
	"created_by" uuid,
	"priority" text DEFAULT 'MEDIUM' NOT NULL,
	"status" text DEFAULT 'TODO' NOT NULL,
	"start_date" date,
	"deadline" date NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"evidence_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tasks_code_unique" UNIQUE("code"),
	CONSTRAINT "tasks_priority_check" CHECK ("tasks"."priority" in ('LOW', 'MEDIUM', 'HIGH')),
	CONSTRAINT "tasks_status_check" CHECK ("tasks"."status" in ('TODO', 'IN_PROGRESS', 'REVIEW', 'BLOCKED', 'DONE')),
	CONSTRAINT "tasks_title_check" CHECK (char_length(trim("tasks"."title")) > 0),
	CONSTRAINT "tasks_dates_check" CHECK ("tasks"."start_date" is null or "tasks"."deadline" >= "tasks"."start_date")
);
--> statement-breakpoint
CREATE TABLE "workstreams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workstreams_project_code_unique" UNIQUE("project_id","code")
);
--> statement-breakpoint
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_actor_user_id_profiles_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_id_users_id_fk" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_managers" ADD CONSTRAINT "project_managers_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_managers" ADD CONSTRAINT "project_managers_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_suggestions" ADD CONSTRAINT "task_suggestions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_suggestions" ADD CONSTRAINT "task_suggestions_workstream_id_workstreams_id_fk" FOREIGN KEY ("workstream_id") REFERENCES "public"."workstreams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_suggestions" ADD CONSTRAINT "task_suggestions_suggested_assignee_id_profiles_id_fk" FOREIGN KEY ("suggested_assignee_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_suggestions" ADD CONSTRAINT "task_suggestions_suggested_by_profiles_id_fk" FOREIGN KEY ("suggested_by") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_suggestions" ADD CONSTRAINT "task_suggestions_reviewer_id_profiles_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_suggestions" ADD CONSTRAINT "task_suggestions_converted_task_id_tasks_id_fk" FOREIGN KEY ("converted_task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_workstream_id_workstreams_id_fk" FOREIGN KEY ("workstream_id") REFERENCES "public"."workstreams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assignee_id_profiles_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workstreams" ADD CONSTRAINT "workstreams_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_entity_idx" ON "activity_logs" USING btree ("entity_type","entity_id","created_at");--> statement-breakpoint
CREATE INDEX "activity_actor_idx" ON "activity_logs" USING btree ("actor_user_id","created_at");--> statement-breakpoint
CREATE INDEX "activity_project_idx" ON "activity_logs" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE INDEX "activity_created_idx" ON "activity_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "notifications" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "notifications_unread_idx" ON "notifications" USING btree ("user_id") WHERE "notifications"."is_read" = false;--> statement-breakpoint
CREATE INDEX "project_managers_user_idx" ON "project_managers" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "suggestions_project_idx" ON "task_suggestions" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "suggestions_by_idx" ON "task_suggestions" USING btree ("suggested_by");--> statement-breakpoint
CREATE INDEX "suggestions_status_idx" ON "task_suggestions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "tasks_project_idx" ON "tasks" USING btree ("project_id") WHERE "tasks"."is_deleted" = false;--> statement-breakpoint
CREATE INDEX "tasks_assignee_idx" ON "tasks" USING btree ("assignee_id") WHERE "tasks"."is_deleted" = false;--> statement-breakpoint
CREATE INDEX "tasks_deadline_idx" ON "tasks" USING btree ("deadline") WHERE "tasks"."is_deleted" = false;--> statement-breakpoint
CREATE INDEX "workstreams_project_idx" ON "workstreams" USING btree ("project_id");