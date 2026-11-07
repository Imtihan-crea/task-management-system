-- Rollback 011. Aplikasi tetap jalan: lib/auth/session.ts dan users.ts punya
-- fallback 42703 bila kolom ini tidak ada. Nilai flag yang tersimpan HILANG.
alter table public.profiles drop column if exists must_change_password;
delete from public.app_migrations where version = '011';
