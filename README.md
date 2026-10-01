# Task Management System

Aplikasi internal untuk mengelola user, role, dan permission.
Status roadmap: **Phase 1 (Foundation) & Phase 2 (User Management) selesai.**

## Stack

- Next.js 16 (App Router) + TypeScript
- Supabase Auth + PostgreSQL + Row Level Security
- Vercel (hosting) + GitHub (source control)

## Pages

| Route | Untuk siapa | Isi |
|---|---|---|
| `/login` | semua | Login |
| `/dashboard` | semua | Welcome + statistik user (Admin) |
| `/users` | **Admin saja** | List, search, filter, sort, invite, aktif/nonaktif |
| `/users/[id]` | **Admin saja** | Detail + edit user |
| `/profile` | semua | Lihat & ubah nama sendiri |

`/users` dan `/users/[id]` dilindungi di **server**, bukan hanya disembunyikan di frontend.

## 1. Jalankan di laptop

```bash
npm install
cp .env.example .env.local   # Windows: copy .env.example .env.local
```

Isi `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

Lokasi nilainya: Supabase Dashboard > **Project Settings** > **API**.

`SUPABASE_SERVICE_ROLE_KEY` hanya boleh dipakai di server. File `.env.local`
sudah masuk `.gitignore` dan tidak pernah di-push.

Jalankan:

```bash
npm run dev
```

Buka http://localhost:3000

## 2. Setup Supabase (sekali saja)

1. **SQL Editor** > New Query > salin `database/migrations/001_create_profiles.sql` > **Run**
2. **SQL Editor** > New Query > salin `database/migrations/002_user_management.sql` > **Run**
3. **Authentication** > **Users** > **Add user** > buat user pertama:
   - isi Email + Password, centang **Auto Confirm User**
   - lalu **Table Editor** > `profiles` > ubah `role` jadi `ADMIN` dan `status` jadi `ACTIVE`

### Catatan penting tentang `status`

`status` adalah **satu-satunya sumber kebenaran**:

| Nilai | Arti |
|---|---|
| `INVITED` | User sudah dibuat, belum selesai mengatur password |
| `ACTIVE` | Bisa login |
| `INACTIVE` | Tidak bisa login |

Kolom `is_active` sekarang jadi **generated column** (`status = 'ACTIVE'`).
Tidak bisa diisi manual, jadi tidak mungkin jadi sumber kebenaran kedua.
Kode aplikasi membaca `status`, bukan `is_active`.

## 3. Environment Variables di Vercel

Tambahkan di **Settings** > **Environment Variables**:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_SITE_URL=https://task-management-system-jatc.vercel.app
```

> Jangan set **Output Directory** menjadi `.next` di Vercel.
> Biarkan default Vercel, kalau diisi manual hasilnya 404 semua halaman.

## 4. Supabase URL Configuration

**Authentication** > **URL Configuration**:

- **Site URL**: `https://task-management-system-jatc.vercel.app`
- **Redirect URLs**: `https://task-management-system-jatc.vercel.app/**`

## 5. Deploy

```bash
git add .
git commit -m "phase 2 user management"
git push
```

Setiap push ke `main` = deploy production otomatis oleh Vercel.

## Struktur project

```
app/
  login/            Halaman login
  dashboard/        Welcome + statistik
  users/            User Management (Admin only)
    [id]/           Detail + edit user
  profile/          Profile self-service
  actions/          Server Actions (semua operasi tulis)
components/
  auth/             Login form, tombol logout
  layout/           AppShell + navigasi
  profile/          Form ubah nama sendiri
  users/            Form invite, edit, aktivasi
lib/
  supabase/
    client.ts       Client browser (anon key)
    server.ts       Client server (anon key + cookie)
    admin.ts        Client service role - HANYA server
    proxy.ts        Refresh session + jaga route
  auth/
    permissions.ts  Permission matrix per role
    roles.ts        Label + validasi role/status
    session.ts      requireProfile() / requireAdmin()
types/profile.ts    Tipe TypeScript
database/migrations/  001 (phase 1), 002 (phase 2)
proxy.ts            Route guard (pengganti middleware di Next 16)
```

## Keamanan

- **Admin check di server.** `requireAdmin()` dipanggil di halaman maupun
  di setiap Server Action, jadi dipanggil langsung dari browser pun tetap ditolak.
- **Role & status tidak bisa diubah user sendiri.** Database hanya memberi hak
  `UPDATE` pada kolom `full_name` untuk user biasa.
- **Service Role Key tidak pernah masuk browser.** File `lib/supabase/admin.ts`
  memakai `server-only` supaya gagal build kalau terbawa ke client.
- **Session user INACTIVE langsung ditendang** di `proxy.ts`, даже kalau
  browser masih menyimpan session.
- **Minimal satu Admin aktif** dijaga di Server Action dan fungsi database.
- **Admin tidak bisa menonaktifkan dirinya sendiri.**
- Password tidak pernah disimpan di `profiles`, tidak pernah ditampilkan,
  dan tidak pernah masuk log.

## Testing

```bash
npm run lint
npm run build
npm run dev
```

Checklist manual (lihat `docs/acceptance-test.md`):

1. Desktop & mobile: login, dashboard, logout
2. `/users`: search, filter role/status, sort
3. Invite user, ganti role, deactivate, activate
4. User non-Admin buka `/users` -> ditolak
5. User INACTIVE -> ditolak saat login
6. Nonaktifkan Admin terakhir -> ditolak
7. Admin coba ubah role sendiri jadi non-Admin -> ditolak

## Kendala yang diketahui

Undangan (`inviteUserByEmail`) membutuhkan **SMTP Supabase**. Pada project
gratis, email hanya terkirim ke anggota tim project. Kalau email tidak sampai,
user tetap dibuat dengan status `INVITED` dan aplikasi menampilkan pesan
khusus. Solusinya: konfigurasi SMTP di **Supabase > Project Settings > Email**,
lalu kirimkan *password reset link* ke user.
