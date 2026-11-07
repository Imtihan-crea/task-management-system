-- 012_secure_handle_new_user.sql
-- 7 Nov 2026: tutup celah eskalasi ke ADMIN lewat pendaftaran mandiri.
--
-- Masalah lama (002): trigger mengambil `role` dari raw_user_meta_data, yang
-- bisa diisi sendiri oleh siapa pun lewat auth.signUp({ options: { data } }).
-- Profil baru juga langsung INVITED, sehingga completeInvite() (accept-invite)
-- mengubahnya ke ACTIVE tanpa bukti undangan.
--
-- Perbaikan:
-- - role SELALU 'TEAM_MEMBER' dari trigger. Role sebenarnya ditulis server
--   (service role) di app/actions/users.ts setelah invite / create user.
-- - status awal 'INACTIVE'. Semua jalur admin langsung meng-update status ke
--   INVITED (invite) atau ACTIVE (create dengan password). Akun yang dibuat
--   di luar jalur admin tetap INACTIVE dan ditolak proxy.
--
-- Tidak ada data yang diubah; hanya fungsi trigger yang diganti.
-- Rollback: jalankan ulang bagian 5 dari 002_user_management.sql.
--
-- Status: SUDAH dijalankan di produksi 7 Nov 2026 ±15:48 WIB (supabase db query).
-- Verifikasi: prosrc memuat INACTIVE + TEAM_MEMBER, tidak lagi membaca role
-- dari metadata. Signup publik juga dimatikan (auth.enable_signup = false).

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
    'TEAM_MEMBER',
    'INACTIVE'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
