-- 029_revoke_user_sessions.sql
-- 20 Nov 2026: keluarkan satu akun dari semua perangkat (keputusan pemilik setelah kasus
-- akun Alghifari dibuat ulang karena dikhawatirkan dipakai orang lain). Menghapus semua
-- sesi dan refresh token akun itu; proxy memanggil auth.getUser() di setiap request, jadi
-- perangkat lama keluar pada klik berikutnya. Dipanggil server (service_role) saja.
-- Nomor 029: 027 dan 028 dipakai cabang yang belum dirilis.
-- Rollback: database/migrations/down/029_revoke_user_sessions.down.sql

create or replace function public.revoke_user_sessions(target uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  delete from auth.sessions where user_id = target;
  get diagnostics n = row_count;
  -- Token lama tanpa sesi (format lama) ikut dibuang.
  delete from auth.refresh_tokens where user_id = target::text;
  return n;
end;
$$;

revoke all on function public.revoke_user_sessions(uuid) from public, anon, authenticated;
grant execute on function public.revoke_user_sessions(uuid) to service_role;

insert into public.app_migrations (version, name, note)
values ('029', '029_revoke_user_sessions', 'Fungsi keluarkan akun dari semua perangkat')
on conflict (version) do nothing;
