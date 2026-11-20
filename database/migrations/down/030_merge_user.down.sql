-- Rollback 030: hapus fungsi gabung akun. Akun yang sudah digabung TIDAK dipisah kembali.
drop function if exists public.merge_user_into(uuid, uuid);
