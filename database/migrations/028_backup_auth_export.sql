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
-- Fungsi kedua, backup_db_config(): lihat di bawah.
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

-- Konfigurasi database di luar tabel public, untuk backup yang sama:
-- jadwal pg_cron (perintahnya bisa memuat CRON_SECRET), policy RLS public +
-- storage, definisi fungsi public (tanpa fungsi milik extension), trigger
-- yang memakai tabel/fungsi public, dan daftar storage.buckets/objects
-- (isi berkas diunduh terpisah oleh lib/backup lewat Storage API).
-- plpgsql + to_regclass: tetap jalan di project tanpa pg_cron.
create or replace function public.backup_db_config()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
  jobs jsonb := '[]'::jsonb;
begin
  if to_regclass('cron.job') is not null then
    execute 'select coalesce(jsonb_agg(to_jsonb(j) order by j.jobid), ''[]''::jsonb) from cron.job j' into jobs;
  end if;
  select jsonb_build_object(
    'cron_jobs', jobs,
    'policies', coalesce((
      select jsonb_agg(to_jsonb(p) order by p.schemaname, p.tablename, p.policyname)
      from pg_catalog.pg_policies p where p.schemaname in ('public', 'storage')
    ), '[]'::jsonb),
    'functions', coalesce((
      select jsonb_agg(jsonb_build_object(
          'name', f.proname,
          'args', pg_catalog.pg_get_function_identity_arguments(f.oid),
          'definition', pg_catalog.pg_get_functiondef(f.oid))
        order by f.proname, pg_catalog.pg_get_function_identity_arguments(f.oid))
      from pg_catalog.pg_proc f
      where f.pronamespace = 'public'::regnamespace and f.prokind in ('f', 'p')
        and not exists (select 1 from pg_catalog.pg_depend d
                        where d.classid = 'pg_catalog.pg_proc'::regclass and d.objid = f.oid and d.deptype = 'e')
    ), '[]'::jsonb),
    'triggers', coalesce((
      select jsonb_agg(jsonb_build_object(
          'table', t.tgrelid::regclass::text,
          'name', t.tgname,
          'definition', pg_catalog.pg_get_triggerdef(t.oid))
        order by t.tgrelid::regclass::text, t.tgname)
      from pg_catalog.pg_trigger t
      join pg_catalog.pg_class c on c.oid = t.tgrelid
      join pg_catalog.pg_proc f on f.oid = t.tgfoid
      where not t.tgisinternal
        and (c.relnamespace = 'public'::regnamespace or f.pronamespace = 'public'::regnamespace)
    ), '[]'::jsonb),
    'storage_buckets', coalesce((
      select jsonb_agg(to_jsonb(b) order by b.id) from storage.buckets b
    ), '[]'::jsonb),
    'storage_objects', coalesce((
      select jsonb_agg(to_jsonb(o) order by o.bucket_id, o.name) from storage.objects o
    ), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;

revoke all on function public.backup_db_config() from public, anon, authenticated;
grant execute on function public.backup_db_config() to service_role;

insert into public.app_migrations (version, name, note)
values ('028', '028_backup_auth_export', 'fungsi backup akun login (hash password) dan konfigurasi database untuk backup email, hanya service_role')
on conflict (version) do nothing;
