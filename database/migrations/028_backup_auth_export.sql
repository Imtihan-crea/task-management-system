-- 028_backup_auth_export.sql
-- 19 Nov 2026: backup harian lewat email (lib/backup) memuat akun login lengkap
-- supaya pemulihan mempertahankan password lama (keputusan pemilik).
-- public.backup_auth_export() mengembalikan { users, identities }: baris penuh
-- auth.users (termasuk encrypted_password = hash bcrypt, bukan password asli) dan
-- auth.identities. Token sementara (konfirmasi, recovery, ganti email/telepon,
-- reauthentication) dikosongkan menjadi '' (bukan NULL: GoTrue gagal membaca
-- NULL di kolom token saat login). Kolom generated (users.confirmed_at,
-- identities.email) dibuang supaya hasilnya bisa langsung di-insert ulang.
-- Hanya service_role (cron backup) yang boleh memanggil: hasilnya memuat hash
-- password semua user.
-- Rollback: database/migrations/down/028_backup_auth_export.down.sql

create or replace function public.backup_auth_export()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'users', coalesce((
      select jsonb_agg(
        (to_jsonb(u) - 'confirmed_at') || jsonb_build_object(
          'confirmation_token', '',
          'recovery_token', '',
          'email_change_token_new', '',
          'email_change_token_current', '',
          'phone_change_token', '',
          'reauthentication_token', ''
        )
        order by u.created_at, u.id)
      from auth.users u
    ), '[]'::jsonb),
    'identities', coalesce((
      select jsonb_agg(to_jsonb(i) - 'email' order by i.created_at, i.id)
      from auth.identities i
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.backup_auth_export() from public, anon, authenticated;
grant execute on function public.backup_auth_export() to service_role;

insert into public.app_migrations (version, name, note)
values ('028', '028_backup_auth_export', 'fungsi backup akun login (hash password) untuk backup email, hanya service_role')
on conflict (version) do nothing;
