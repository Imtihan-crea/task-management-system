# Task Management System

Aplikasi internal untuk mengelola project, workstream, task, user, dan role.
Status roadmap: **Phase 1 (Foundation), Phase 2 (User Management), Phase 3 (Task)
& Phase 4 (Project & Workstream) selesai.**

## Stack

- Next.js 16 (App Router) + TypeScript
- Supabase Auth + PostgreSQL + Row Level Security
- Vercel (hosting) + GitHub (source control)

## Pages

| Route | Untuk siapa | Isi |
|---|---|---|
| `/login` | semua | Login |
| `/accept-invite` ||Calon user | Set password & aktivasi akun (dari link undangan) |
| `/dashboard` | semua | Welcome + statistik user (Admin) + My Tasks |
| `/projects` | semua | Project board + progress + create (Admin/PM) |
| `/projects/[id]` | semua | Detail + workstream + task project + edit (Admin/PM) |
| `/tasks` | semua (member: miliknya) | List + search/filter/sort + My Tasks |
| `/tasks/new` | Admin, PM | Create task |
| `/tasks/[id]` | sesuai scope | Detail + edit + status + delete |
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
APP_URL=http://localhost:3000
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
APP_URL=https://task-management-system-jatc.vercel.app
```

> **Penting - pakai `APP_URL`, bukan `NEXT_PUBLIC_SITE_URL`.**
> Link invitation selalu dibangun dari `APP_URL`, bukan dari domain request.
> Kalautaken dari domain request, setiap link yang dibuat dari **Preview
> Deployment** akan mengarah ke domain preview yang tidak terdaftar di
> Supabase, dan Supabase akan menolak mengirim email.
>
> Pastikan `APP_URL` diisi untuk **Production dan Preview** di Vercel
> (centang semua kolom Environment).

> Jangan set **Output Directory** menjadi `.next` di Vercel.
> Biarkan default Vercel, kalau diisi manual hasilnya 404 semua halaman.

## 4. Supabase URL Configuration

**Authentication** > **URL Configuration**:

- **Site URL**: `https://task-management-system-jatc.vercel.app`
- **Redirect URLs**:
  - `https://task-management-system-jatc.vercel.app/**`
  - `http://localhost:3000/**` (untuk development)

> **Penting:** `Site URL` **wajib** diganti ke domain production. Kalau masih
> `localhost`, link undangan akan mengarah ke `localhost:3000` dan user tidak
> akan pernah sampai ke halaman `/accept-invite`.

## 4b. Alur onboarding user

```text
Admin: /users -> Invite User
        ↓
Supabase kirim email "You've been invited"
        ↓
User klik "Accept invitation"
        ↓
/accept-invite  -> user buat password sendiri
        ↓
Status otomatis: INVITED -> ACTIVE
        ↓
User login dengan email + password tadi
```

Admin **tidak pernah** melihat atau membuat password user.
Link undangan selalu dibangun dari env var `APP_URL`, bukan dari domain
request, jadi tidak akan pernah mengarah ke `localhost` atau ke domain
preview yang tidak terdaftar di Supabase.

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
  accept-invite/    Set password dari link undangan
  dashboard/        Welcome + statistik + My Tasks
  projects/         Project board (semua role bisa lihat)
    [id]/           Detail + workstream + task + edit (Admin/PM)
  tasks/            Task list + search/filter/sort + My Tasks
    new/            Create task (Admin, PM)
    [id]/           Detail + edit + status + delete
  users/            User Management (Admin only)
    [id]/           Detail + edit user
  profile/          Profile self-service
  actions/          Server Actions (semua operasi tulis)
components/
  auth/             Login form, tombol logout
  layout/           AppShell + navigasi
  profile/          Form ubah nama sendiri
  projects/         Form project + workstream
  tasks/            Form task + status + delete
  users/            Form invite, edit, aktivasi
  ui/               Badge status/priority/overdue
lib/
  supabase/
    client.ts       Client browser (anon key)
    server.ts       Client server (anon key + cookie)
    admin.ts        Client service role - HANYA server
    proxy.ts        Refresh session + jaga route
  app-url.ts        URL aplikasi untuk link invitation (dari env var)
  auth/
    permissions.ts  Permission matrix per role
    roles.ts        Label + validasi role/status project/task
    session.ts      requireProfile() / requireAdmin() / requireManager()
  data/
    users.ts        getActiveUsers() - HANYA server
    user-options.ts Tipe + label user (aman untuk client)
  utils/
    dates.ts        Format tanggal + overdue check
types/              profile.ts, project.ts, workstream.ts, task.ts
database/migrations/  001 (phase 1), 002 (phase 2), 003 (phase 3&4)
docs/               Panduan setup email SMTP + checklist acceptance test
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

## Troubleshooting

### `Unable to invite user. Please try again.`

Cek **Vercel > Project > Logs**, cari baris `[invite] Supabase error:`.
Pesan di situ yang menentukan penyebabnya:

| Pesan di log | Penyebab | Solusi |
|---|---|---|
| `redirect_to ... not allowed` | Domain preview tidak terdaftar | Set `APP_URL` untuk Preview juga, atau pakai domain production |
| `rate limit` / `security purposes` | Kuota email gratis habis | Tunggu 1 jam, atau konfigurasi SMTP |
| `User already registered` | User masih ada di Supabase Auth | Hapus di **Authentication > Users** |

### `This email is still registered in Supabase Auth.`

User yang dihapus dari tabel `profiles` **masih ada** di Supabase Auth.
Hapus lewat **Supabase Dashboard > Authentication > Users**, bukan dari
Table Editor. Profile akan ikut terhapus otomatis karena trigger
`ON DELETE CASCADE` di `auth.users`.

### Link invitation dianggap expired

Setiap link invitation hanya bisa dibuka **satu kali**. Kalau sudah
terbuka, minta user membuka email terbaru, atau hapus user di
Supabase Auth lalu invite ulang.

### Email tidak sampai ke user

Project Supabase gratis hanya bisa mengirim email ke anggota tim project,
dengan kuota sekitar 2 email per jam. Untuk production, wajib konfigurasi
SMTP sendiri. Panduan lengkap ada di
[`docs/setup-email.md`](docs/setup-email.md).

### Link invitation tidak terkirim (kuota email habis)

Aplikasi otomatis membuat user lalu menampilkan **link invitation** yang bisa
disalin dan dikirim manual (WhatsApp/email). Ini fallback agar tidak bergantung
pada email. `generateLink` tidak memakai kuota email.

Link invitation hanya bisa dibuka **satu kali** dan hanya untuk user tersebut.
