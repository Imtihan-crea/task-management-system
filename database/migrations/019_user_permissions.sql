-- 019_user_permissions.sql
-- 16 Nov 2026: wewenang per akun (permintaan pemilik, mirip FMS).
--
-- Peran tetap jadi paket awal (lib/auth/permissions.ts). Tabel ini menyimpan
-- pengecualian per akun: beri (granted = true) atau cabut (false), untuk semua
-- project (project_id null) atau satu project. Aturan hitungnya ada di
-- lib/auth/access.ts. Hanya Super Admin dan Developer yang boleh mengubah,
-- lewat server action (service role); user biasa hanya bisa membaca miliknya.
-- profiles.is_developer: akun Developer, setara Super Admin untuk wewenang.
-- Tidak ada baris data yang diubah.
-- Rollback: database/migrations/down/019_user_permissions.down.sql

alter table public.profiles
  add column if not exists is_developer boolean not null default false;

alter table public.profiles
  drop constraint if exists profiles_developer_is_active_admin;
alter table public.profiles
  add constraint profiles_developer_is_active_admin
  check (not is_developer or (role = 'ADMIN' and status = 'ACTIVE'));

create table if not exists public.user_permissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  permission text not null check (char_length(permission) between 3 and 60),
  project_id uuid references public.projects(id) on delete cascade,
  granted boolean not null,
  granted_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

-- Satu aturan per (user, izin, project); null project = semua project.
create unique index if not exists user_permissions_unique
  on public.user_permissions (user_id, permission, coalesce(project_id, '00000000-0000-0000-0000-000000000000'::uuid));

alter table public.user_permissions enable row level security;

revoke all on public.user_permissions from anon, authenticated;
grant select on public.user_permissions to authenticated;

drop policy if exists "Users read own permissions" on public.user_permissions;
create policy "Users read own permissions" on public.user_permissions
  for select to authenticated using (user_id = auth.uid());

insert into public.app_migrations (version, name, note)
values ('019', '019_user_permissions', 'tabel user_permissions + profiles.is_developer')
on conflict (version) do nothing;
