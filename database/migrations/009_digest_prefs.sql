-- 009_digest_prefs.sql
-- Phase 11 update (6 Okt 2026): preferensi email untuk Morning Digest harian.
-- ADDITIVE ONLY: 1 kolom nullable-free dengan default true (opt-out, bukan
-- opt-in — user lama tetap dapat digest sampai mereka mematikan sendiri).

alter table public.notification_preferences
  add column if not exists email_digest_daily boolean not null default true;
