-- Rollback 012: kembalikan trigger versi 002 (role dari metadata, status INVITED).
-- PERINGATAN: membuka lagi celah eskalasi ADMIN bila signup publik aktif.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, role, status)
  values (
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      split_part(new.email, '@', 1)
    ),
    coalesce(new.raw_user_meta_data ->> 'role', 'TEAM_MEMBER'),
    'INVITED'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
delete from public.app_migrations where version = '012';
