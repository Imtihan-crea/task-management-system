-- 030_merge_user.sql
-- 20 Nov 2026: gabung dua akun satu orang menjadi satu (keputusan pemilik setelah kasus akun
-- Alghifari dan Handi Gustira dibuat ulang). Semua data akun sumber pindah ke akun tujuan,
-- lalu akun sumber dihapus (deleted_at, INACTIVE, sesi dicabut) sehingga tidak tampil lagi.
-- Data yang akan kembar di tujuan (peserta meeting yang sama, PM project yang sama, wewenang
-- yang sama, preferensi notifikasi) milik sumber dibuang; milik tujuan dipakai.
-- Data karyawan tujuan yang kosong diisi dari sumber. Kolom FK ke profiles dicari otomatis,
-- jadi tabel baru ikut terbawa. Dipanggil server (service_role) saja.
-- Rollback: database/migrations/down/030_merge_user.down.sql (data yang sudah digabung tidak
-- dikembalikan; lihat activity USER_MERGED untuk jumlah per tabel).

create or replace function public.merge_user_into(source uuid, target uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  n bigint;
  moved jsonb := '{}'::jsonb;
  src public.profiles%rowtype;
  dst public.profiles%rowtype;
begin
  if source = target then raise exception 'Akun sumber dan tujuan sama.'; end if;
  select * into src from public.profiles where id = source for update;
  select * into dst from public.profiles where id = target for update;
  if src.id is null or dst.id is null then raise exception 'Akun tidak ditemukan.'; end if;
  if src.deleted_at is not null or dst.deleted_at is not null then raise exception 'Akun yang sudah dihapus tidak bisa digabung.'; end if;

  -- Baris yang akan kembar di tujuan: buang milik sumber.
  delete from public.meeting_participants s where s.user_id = source
    and exists (select 1 from public.meeting_participants t where t.user_id = target and t.meeting_id = s.meeting_id);
  delete from public.project_managers s where s.user_id = source
    and exists (select 1 from public.project_managers t where t.user_id = target and t.project_id = s.project_id);
  delete from public.user_permissions s where s.user_id = source
    and exists (select 1 from public.user_permissions t where t.user_id = target and t.permission = s.permission
      and coalesce(t.project_id, '00000000-0000-0000-0000-000000000000') = coalesce(s.project_id, '00000000-0000-0000-0000-000000000000'));
  delete from public.notification_preferences s where s.user_id = source
    and exists (select 1 from public.notification_preferences t where t.user_id = target);

  for r in
    select kcu.table_name, kcu.column_name
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu on kcu.constraint_name = tc.constraint_name and kcu.table_schema = tc.table_schema
    join information_schema.constraint_column_usage ccu on ccu.constraint_name = tc.constraint_name and ccu.table_schema = tc.table_schema
    where tc.constraint_type = 'FOREIGN KEY' and tc.table_schema = 'public'
      and ccu.table_name = 'profiles' and ccu.column_name = 'id' and kcu.table_name <> 'profiles'
  loop
    execute format('update public.%I set %I = $1 where %I = $2', r.table_name, r.column_name, r.column_name) using target, source;
    get diagnostics n = row_count;
    if n > 0 then moved := moved || jsonb_build_object(r.table_name || '.' || r.column_name, n); end if;
  end loop;

  update public.profiles set
    division = coalesce(dst.division, src.division),
    position_title = coalesce(dst.position_title, src.position_title),
    position_level = coalesce(dst.position_level, src.position_level),
    join_date = coalesce(dst.join_date, src.join_date),
    annual_leave_quota = coalesce(dst.annual_leave_quota, src.annual_leave_quota),
    tracker_required = dst.tracker_required or src.tracker_required
  where id = target;

  update public.profiles set status = 'INACTIVE', deleted_at = now() where id = source;
  delete from auth.sessions where user_id = source;
  delete from auth.refresh_tokens where user_id = source::text;
  return moved;
end;
$$;

revoke all on function public.merge_user_into(uuid, uuid) from public, anon, authenticated;
grant execute on function public.merge_user_into(uuid, uuid) to service_role;

insert into public.app_migrations (version, name, note)
values ('030', '030_merge_user', 'Fungsi gabung akun')
on conflict (version) do nothing;
