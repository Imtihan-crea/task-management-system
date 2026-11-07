-- Rollback 014. WAJIB kembalikan dulu kode app/actions/projects.ts ke versi
-- sebelum commit ba746a8 (hapus-lalu-insert), karena kode sekarang memanggil
-- RPC ini; tanpa itu simpan project gagal "managers could not be updated".
drop function if exists public.set_project_managers(uuid, uuid[]);
delete from public.app_migrations where version = '014';
