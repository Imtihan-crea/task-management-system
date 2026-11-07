-- 014_set_project_managers_rpc.sql
-- 7 Nov 2026: ganti daftar PM sebuah project dalam SATU transaksi.
--
-- Masalah lama: app/actions/projects.ts menghapus semua PM lalu insert ulang
-- lewat dua request terpisah. Bila insert gagal (FK, jaringan), project
-- tertinggal tanpa PM dan PM terkunci dari project-nya sendiri.
--
-- Perbaikan: fungsi plpgsql dijalankan sebagai satu transaksi oleh PostgREST.
-- Error di langkah mana pun membatalkan semuanya; daftar PM lama tetap utuh.
-- Baris PM yang tetap ada tidak dihapus, jadi created_at-nya tidak berubah.
--
-- Hanya service_role (server actions) yang boleh memanggil. Tanpa revoke,
-- user login bisa memanggil RPC ini langsung dan mengubah PM project mana pun.
--
-- Rollback: drop function public.set_project_managers(uuid, uuid[]);
--
-- Status: SUDAH dijalankan di produksi 7 Nov 2026 ±16:30 WIB (supabase db query).
-- Uji (transaksi di-rollback): FK error di tengah -> daftar PM lama utuh;
-- ganti normal benar; execute hanya service_role (anon ditolak 42501).

create or replace function public.set_project_managers(
  p_project_id uuid,
  p_user_ids uuid[]
)
returns void
language plpgsql
security invoker
set search_path = public as $$
begin
  delete from public.project_managers
  where project_id = p_project_id
    and user_id <> all (coalesce(p_user_ids, '{}'));

  insert into public.project_managers (project_id, user_id)
  select p_project_id, u
  from unnest(coalesce(p_user_ids, '{}')) as u
  on conflict (project_id, user_id) do nothing;
end;
$$;

revoke all on function public.set_project_managers(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.set_project_managers(uuid, uuid[]) to service_role;
