-- 002_user_management.sql
-- Phase 2: status INVITED/ACTIVE/INACTIVE, column-level security, RLS refresh
-- Prinsip: `status` adalah SATU-SATUNYA sumber kebenaran.
-- `is_active` dijadikan generated column (dihitung otomatis dari status)
-- supaya kode lama tidak mendadak rusak, tapi tidak bisa diubah manual.

-- 1. Tambah kolom status
alter table public.profiles
  add column if not exists status text;

-- 2. Backfill data lama: is_active = true -> ACTIVE, false -> INACTIVE
update public.profiles
set status = case when is_active then 'ACTIVE' else 'INACTIVE' end
where status is null;

-- 3. Jangan biarkan NULL, dan batasi nilainya
alter table public.profiles alter column status set default 'INVITED';
alter table public.profiles alter column status set not null;

alter table public.profiles
  drop constraint if exists profiles_status_check;
alter table public.profiles
  add constraint profiles_status_check
  check (status in ('INVITED', 'ACTIVE', 'INACTIVE'));

-- 4. Jadikan is_active kolom generated (read-only, diturunkan dari status)
alter table public.profiles drop column if exists is_active;
alter table public.profiles
  add column is_active boolean
  generated always as (status = 'ACTIVE') stored;

-- 5. Auto-buat profile saat user baru dibuat.
--    Default status = INVITED karena user belum selesai setup password.
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

-- 6. Helper admin aktif (dipakai oleh RLS)
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'ADMIN'
      and status = 'ACTIVE'
  );
$$;

-- 7. RLS tetap aktif
alter table public.profiles enable row level security;

-- 8. Bersihkan policy lama lalu pasang ulang yang sesuai Phase 2
drop policy if exists "Users can view own profile"   on public.profiles;
drop policy if exists "Admins can view all profiles" on public.profiles;
drop policy if exists "Users can update own name"     on public.profiles;
drop policy if exists "Admins can update all profiles" on public.profiles;

-- User biasa: hanya boleh baca profile sendiri
create policy "Users can view own profile"
  on public.profiles for select
  to authenticated
  using (auth.uid() = id);

-- Admin aktif: boleh baca semua profile
create policy "Admins can view all profiles"
  on public.profiles for select
  to authenticated
  using (public.is_admin());

-- User biasa: boleh update barisnya sendiri, TAPI hanya kolom full_name
-- (dibatasi oleh column-level grant di bawah)
create policy "Users can update own profile"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- 9. PEMBATASAN KOLOM - ini yang mencegah user ubah role/status sendiri.
--    User biasa tidak boleh update tabel secara keseluruhan,
--    hanya kolom full_name.
revoke update on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (full_name) on public.profiles to authenticated;

-- 10. Admin tidak boleh hilang semua (dijaga juga di server, ini lapisan kedua)
create or replace function public.count_active_admins(exclude_id uuid)
returns integer
language sql
security definer
set search_path = public as $$
  select count(*)::integer
  from public.profiles
  where role = 'ADMIN'
    and status = 'ACTIVE'
    and id <> exclude_id;
$$;
