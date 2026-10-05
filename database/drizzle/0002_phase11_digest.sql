-- ============================================================================
-- PHASE 11 UPDATE (6 Okt 2026). JANGAN DIJALANKAN KE DATABASE PRODUCTION.
-- ============================================================================
-- Bentuk Drizzle dari `database/migrations/009_digest_prefs.sql` (1 kolom).
-- File di folder ini dokumentasi/baseline saja, tidak dieksekusi.
-- ============================================================================
ALTER TABLE "notification_preferences" ADD COLUMN "email_digest_daily" boolean DEFAULT true NOT NULL;