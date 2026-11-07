-- Tes RLS + hak akses database (npm run test:rls).
-- SELALU dibatalkan: blok akhir melempar exception, jadi seluruh transaksi
-- (termasuk perubahan status / user uji) di-rollback. Aman di produksi.
-- Butuh minimal: 1 user ACTIVE TEAM_MEMBER, 1 user lain, 1 project.
begin;

create temp table hasil (nama text, lulus boolean, detail text);
-- hasil ditulis saat role diganti ke authenticated/anon
grant insert on hasil to authenticated, anon;

do $t$
declare
  tm uuid;           -- TEAM_MEMBER aktif
  n int;
  t text;
  err text;
  new_id uuid := gen_random_uuid();
  tabel text[] := array[
    'activity_logs', 'meeting_action_items', 'meeting_agendas',
    'meeting_decisions', 'meeting_participants', 'meetings',
    'notification_events', 'notification_preferences', 'notifications',
    'project_managers', 'projects', 'task_suggestions', 'tasks', 'workstreams'];
begin
  select id into tm from public.profiles where status = 'ACTIVE' and role = 'TEAM_MEMBER' limit 1;
  if tm is null then raise exception 'butuh 1 user ACTIVE TEAM_MEMBER'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', tm, 'role', 'authenticated')::text, true);

  -- 1. user ACTIVE bisa baca project
  execute 'set local role authenticated';
  select count(*) into n from public.projects;
  insert into hasil values ('ACTIVE membaca projects', n > 0, n || ' baris');
  -- 2. TEAM_MEMBER hanya melihat profil sendiri
  select count(*) into n from public.profiles;
  insert into hasil values ('TEAM_MEMBER hanya profil sendiri', n = 1, n || ' baris');
  -- 3. user tidak bisa ubah role sendiri (column grant hanya full_name)
  begin
    update public.profiles set role = 'ADMIN' where id = tm;
    insert into hasil values ('tolak ubah role sendiri', false, 'UPDATE role berhasil');
  exception when insufficient_privilege then
    insert into hasil values ('tolak ubah role sendiri', true, 'insufficient_privilege');
  end;
  -- 4. user tidak bisa insert task langsung (tulis hanya lewat server)
  begin
    insert into public.tasks (title) values ('uji-rls');
    insert into hasil values ('tolak insert task langsung', false, 'INSERT berhasil');
  exception when others then
    insert into hasil values ('tolak insert task langsung', true, sqlstate);
  end;
  execute 'reset role';

  -- 5. INACTIVE: 0 baris di semua tabel, profil sendiri tetap 1
  update public.profiles set status = 'INACTIVE' where id = tm;
  execute 'set local role authenticated';
  foreach t in array tabel loop
    execute format('select count(*) from public.%I', t) into n;
    insert into hasil values ('INACTIVE: ' || t || ' kosong', n = 0, n || ' baris');
  end loop;
  select count(*) into n from public.profiles;
  insert into hasil values ('INACTIVE: profil sendiri terbaca', n = 1, n || ' baris');
  execute 'reset role';

  -- 6. INVITED: data tertutup
  update public.profiles set status = 'INVITED' where id = tm;
  execute 'set local role authenticated';
  select count(*) into n from public.projects;
  insert into hasil values ('INVITED: projects kosong', n = 0, n || ' baris');
  execute 'reset role';

  -- 7. anon tidak bisa membaca data
  perform set_config('request.jwt.claims', '', true);
  execute 'set local role anon';
  begin
    select count(*) into n from public.projects;
    insert into hasil values ('anon: projects kosong/ditolak', n = 0, n || ' baris');
  exception when insufficient_privilege then
    insert into hasil values ('anon: projects kosong/ditolak', true, 'insufficient_privilege');
  end;
  execute 'reset role';

  -- 8. hak eksekusi fungsi sensitif
  insert into hasil values ('set_project_managers: authenticated ditolak',
    not has_function_privilege('authenticated', 'public.set_project_managers(uuid, uuid[])', 'execute'), null);
  insert into hasil values ('set_project_managers: anon ditolak',
    not has_function_privilege('anon', 'public.set_project_managers(uuid, uuid[])', 'execute'), null);
  insert into hasil values ('app_migrations: authenticated tanpa akses',
    not has_table_privilege('authenticated', 'public.app_migrations', 'select'), null);

  -- 9. pendaftar yang minta role ADMIN tetap TEAM_MEMBER + INACTIVE
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values (new_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          'uji-rls-' || new_id || '@example.invalid', '{"role":"ADMIN"}'::jsonb, now(), now());
  select count(*) into n from public.profiles where id = new_id and role = 'TEAM_MEMBER' and status = 'INACTIVE';
  insert into hasil values ('signup minta ADMIN -> TEAM_MEMBER INACTIVE', n = 1, n || ' baris cocok');

  -- 10. semua policy restrictive terpasang
  select count(*) into n from pg_policy where polname = 'Only active users' and not polpermissive;
  insert into hasil values ('15 policy restrictive terpasang', n = 15, n || ' policy');
end
$t$;

do $$
begin
  -- Ringkas supaya tidak terpotong: total, jumlah gagal, lalu nama yang gagal saja.
  raise exception 'HASIL_RLS total=% gagal=% :: %',
    (select count(*) from hasil),
    (select count(*) from hasil where not lulus),
    coalesce((select string_agg(nama || ' (' || coalesce(detail, '-') || ')', ' ;; ') from hasil where not lulus), '-');
end
$$;
