-- Rollback 029: hapus fungsi pencabut sesi. Tidak ada data yang dipulihkan.
drop function if exists public.revoke_user_sessions(uuid);
