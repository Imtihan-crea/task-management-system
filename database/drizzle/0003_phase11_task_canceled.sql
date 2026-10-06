-- ============================================================================
-- PHASE 11 UPDATE (7 Okt 2026). JANGAN DIJALANKAN KE DATABASE PRODUCTION.
-- ============================================================================
-- Bentuk Drizzle dari `database/migrations/010_task_canceled.sql`.
-- Backfill completed_at (= updated_at untuk DONE lama) tidak muncul di sini
-- karena itu data, bukan skema — ada di file migrasi yang dijalankan.
-- ============================================================================
ALTER TABLE "tasks" DROP CONSTRAINT "tasks_status_check";--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "cancelled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_status_check" CHECK ("tasks"."status" in ('TODO', 'IN_PROGRESS', 'REVIEW', 'BLOCKED', 'DONE', 'CANCELLED'));