-- ============================================================================
-- PHASE 11 UPDATE (3 Nov 2026). Bentuk Drizzle dari
-- `database/migrations/011_must_change_password.sql`.
-- Satu kolom boolean untuk opsi "Require password change on first login"
-- saat admin membuat user langsung dengan password.
-- ============================================================================
ALTER TABLE "profiles" ADD COLUMN "must_change_password" boolean DEFAULT false NOT NULL;