-- Rollback 015: hapus catatan migrasi (tidak memengaruhi aplikasi).
drop table if exists public.app_migrations;
