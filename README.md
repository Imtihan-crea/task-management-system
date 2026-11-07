# Task Management System

Aplikasi internal untuk mengelola project, workstream, task, user, dan role.
Status roadmap: **Phase 1 (Foundation), Phase 2 (User Management), Phase 3 (Task)
& Phase 4 (Project & Workstream) selesai.**

## Production

**https://kasuat-task.vercel.app** — satu-satunya alamat resmi.
Login: **https://kasuat-task.vercel.app/login**

> **Aturan satu alamat (7 Nov 2026).** Semua akses GET/HEAD lewat domain lama
> (`task-management-system-jatc.vercel.app` dan URL preview
> `task-management-system-jatc-…`) dialihkan permanen **308** ke
> `https://kasuat-task.vercel.app` oleh `proxy.ts`. Request **POST tidak**
> dialihkan supaya cron Supabase (`pg_net`) tetap jalan. Sejak 7 Nov 2026
> job `pg_cron` `meeting-reminders` sudah diarahkan ke
> `https://kasuat-task.vercel.app/api/cron/meetings` (lihat laporan §19).
> Aturannya ada di `lib/config/canonical.ts` + `tests/canonical.check.ts`.
>
> Sejak 5 Nov 2026 project Vercel diganti nama dari
> `task-management-system-jatc` menjadi `kasuat-task`, karena domain lama
> tidak bisa dibuka dari jaringan kantor/ISP owner (filter DNS per-nama-domain;
> server terbukti sehat dari 40 node termasuk Jakarta). Domain lama masih
> melayani build yang sama sampai ada deployment baru, tapi jangan dipakai lagi.
> Setelah rename, `APP_URL` dan Supabase URL Configuration wajib diarahkan ke
> domain baru, lalu lakukan **Redeploy** supaya alias baru aktif.

## Stack

- Next.js 16 (App Router) + TypeScript
- Supabase Auth + PostgreSQL + Row Level Security
- Vercel (hosting) + GitHub (source control)

## Pages

| Route | Untuk siapa | Isi |
|---|---|---|
| `/login` | semua | Login |
| `/accept-invite` ||Calon user | Set password & aktivasi akun (dari link undangan) |
| `/dashboard` | semua | Welcome + KPI + Gantt global + donut + Task Terdekat + Recent Activity |
| `/projects` | semua (member: yang dia terlibat) | Project board + progress + create (Admin/PM) |
| `/projects/[id]` | semua (member: yang dia terlibat) | Workspace tabs: Overview/Workstreams/Tasks/Activity/Members/Settings |
| `/workstreams` | semua (scope project) | List workstream global + task count |
| `/tasks` | semua (member: miliknya) | Tabs (All/My/On Going/To Do/Blocked/Done/Overdue) + search debounce + filter/sort |
| `/tasks/new` | Admin, PM (project miliknya) | Create task |
| `/tasks/[id]` | sesuai scope | Detail + edit + status + evidence + delete + activity |
| `/task-suggestions` | semua kecuali Viewer (via tombol, tidak di nav) | List + My Suggestions + review dalam scope |
| `/task-suggestions/new` | Admin, PM, Member | Create suggestion (juga via tombol di Tasks & Project) |
| `/task-suggestions/[id]` | creator/PM scope/Admin | Detail + review (assignee picker) + resubmit + approve→task + history |
| `/notifications` | semua | Center + preferensi email (bell popover di header) |
| `/activity` | semua (scope per role) | Tabs entity + filter + timeline + pagination |
| `/settings` | semua | Account + preferensi email |
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
BREVO_API_KEY=
BREVO_SENDER_EMAIL=
BREVO_SENDER_NAME=Task Management System
```

Lokasi nilainya: Supabase Dashboard > **Project Settings** > **API**.
`BREVO_API_KEY` dari Brevo Dashboard > **SMTP & API** (untuk email notifikasi
task DONE, assignment, dan suggestion; panduan SMTP ada di `docs/setup-email.md`).

Notifikasi terpusat di `lib/notifications/service.ts`: klaim event key dulu
(idempotent, tidak ada duplikat) → tulis in-app → kirim email sesuai policy
+ preferensi user. Kegagalan email tidak menggagalkan transaksi. Suggestion
(`S-001`) di-review PM/Admin; approve menghasilkan tepat satu task.

Activity append-only di `lib/activity-log/service.ts`: semua mutation penting
mencatat actor + old/new values; timeline tampil di task/project/suggestion
dan dashboard. Scheduler deadline (`/api/cron/deadlines`, Bearer `CRON_SECRET`,
harian) memakai service notifikasi yang sama.

Visual: Kasuat gold + Poppins/Onest + logo; sidebar collapsible + drawer mobile;
bell popover + profile menu di header; lihat `docs/completion-report-phase10.md`.

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
3. **SQL Editor** > New Query > salin `database/migrations/003_projects_workstreams_tasks.sql` > **Run**
4. **SQL Editor** > New Query > salin `database/migrations/004_multi_pm_and_evidence.sql` > **Run**
5. **SQL Editor** > New Query > salin `database/migrations/005_human_readable_codes.sql` > **Run**
6. **SQL Editor** > New Query > salin `database/migrations/006_suggestions_notifications.sql` > **Run**
3. **Authentication** > **Users** > **Add user** > buat user pertama:
   - isi Email + Password, centang **Auto Confirm User**
   - lalu **Table Editor** > `profiles` > ubah `role` jadi `ADMIN` dan `status` jadi `ACTIVE`

### Catatan penting tentang `status`

`status` adalah **satu-satunya sumber kebenaran**:

| Nilai | Arti |
|---|---|
| `INVITED` | User sudah dibuat, belum selesai mengatur password (khusus opsi invite) |
| `ACTIVE` | Bisa login |
| `INACTIVE` | Tidak bisa login |

User yang dibuat lewat **Create User with Password** langsung `ACTIVE`
(tidak melewati `INVITED`), karena admin sudah menetapkan password awal.

Kolom `is_active` sekarang jadi **generated column** (`status = 'ACTIVE'`).
Tidak bisa diisi manual, jadi tidak mungkin jadi sumber kebenaran kedua.
Kode aplikasi membaca `status`, bukan `is_active`.

## 3. Environment Variables di Vercel

Tambahkan di **Settings** > **Environment Variables**:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
APP_URL=https://kasuat-task.vercel.app
BREVO_API_KEY=
BREVO_SENDER_EMAIL=
BREVO_SENDER_NAME=Task Management System
CRON_SECRET=string_acak_panjang (untuk /api/cron/deadlines)
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

- **Site URL**: `https://kasuat-task.vercel.app`
- **Redirect URLs**:
  - `https://kasuat-task.vercel.app/**`
  - `http://localhost:3000/**` (untuk development)

> **Penting:** `Site URL` **wajib** diganti ke domain production. Kalau masih
> `localhost`, link undangan akan mengarah ke `localhost:3000` dan user tidak
> akan pernah sampai ke halaman `/accept-invite`.

## 4b. Alur onboarding user (dua opsi, 3 Nov 2026)

**Opsi 1 — Create with Password (tanpa email):**

```text
Admin: /users -> + Add User -> Create User with Password
        ↓
Admin isi nama, email, password awal (min. 4 karakter), role
        ↓
Opsional: centang "Require password change on first login"
        ↓
User langsung ACTIVE — tidak ada email yang dikirim
        ↓
Admin bagikan email + password lewat kanal aman (WhatsApp/chat)
        ↓
(jika dicentang) login pertama -> /change-password -> dashboard
```

**Opsi 2 — Send Invite (email):**

```text
Admin: /users -> + Add User -> Send Invitation
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

Pada Opsi 1 admin **membuat** password awal (konsekuensi yang disadari
owner). Karena itu:
- password awal minimal **4 karakter** (aturan owner), tapi **Supabase
  punya minimum sendiri** — default 6. Kalau ingin benar-benar 4, turunkan
  di **Supabase Dashboard → Authentication → Settings → Password minimum
  length**.
- centang **"Require password change on first login"** supaya password
  sementara wajib diganti user sebelum memakai aplikasi (user diarahkan ke
  `/change-password`, minimal 8 karakter).

Pada Opsi 2 admin **tidak pernah** melihat atau membuat password user.
Link undangan selalu dibangun dari env var `APP_URL`, bukan dari domain
request, jadi tidak akan pernah mengarah ke `localhost` atau ke domain
preview yang tidak terdaftar di Supabase.

## 4c. Lupa password (reset)

Ditambahkan 5 Nov 2026. Sebelumnya link recovery Supabase selalu gagal
karena dianggap link undangan dan diarahkan ke `/accept-invite`.

```text
Admin/user minta reset (Supabase Dashboard -> Authentication -> Users
  -> pilih user -> Send recovery, ATAU nanti lewat tombol di aplikasi)
        ↓
Email berisi link recovery
        ↓
Link membuka "/" -> router mendeteksi type=recovery -> /reset-password
        ↓
/reset-password menukar token menjadi session
  (mendukung #access_token, #token_hash, dan ?code= PKCE)
        ↓
User mengisi password baru (minimal 8 karakter) + konfirmasi
        ↓
Dashboard
```

Catatan:
- Link recovery bersifat **sekali pakai** dan kedaluwarsa (default 1 jam).
- Kalau email recovery tidak masuk (batas free tier Supabase), link bisa
  dibuat lewat Admin API / Supabase Dashboard.
- Password baru diubah lewat sesi user sendiri (`supabase.auth.updateUser`),
  bukan service role.

## 4c-bis. Backup database

Plan FREE Supabase **tidak menyimpan backup**. Buat backup sendiri dengan
`npm run db:backup` (hasil di `private/backups/`, gitignored). Panduan
lengkap, jadwal, dan cara restore: [`docs/backup.md`](docs/backup.md).

## 4c-ter. Error monitoring

Error server dikirim ke email admin (maks. 1 email per hari). Sentry
terpasang dan aktif setelah `SENTRY_DSN`/`NEXT_PUBLIC_SENTRY_DSN` diisi di
Vercel. Detail: [`docs/monitoring.md`](docs/monitoring.md).

## 4d. Aturan data privat

Repo ini **tidak boleh** menyimpan atau mencetak data privat:

- service role key, anon key, Brevo API key, `CRON_SECRET`, connection string
- access/refresh token, `token_hash`, link recovery/undangan
- password user, email pribadi, nomor telepon

Aturan lengkap ada di `AGENTS.md` bagian **Aturan Data Privat**. Pemeriksa
otomatis:

```bash
npm run check:secrets
```

Script memindai file yang ter-track git dan **gagal** kalau menemukan token,
API key, connection string, private key, atau email non-placeholder. Nilai
temuan tidak pernah dicetak. Pemeriksaan ini juga ikut `npm run test:logic`.

Kalau ada secret yang terlanjur ter-commit: **rotasi dulu** (Supabase JWT /
service role, Brevo key, `CRON_SECRET`), baru bersihkan histori.

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
  reset-password/   Set password baru dari link recovery (lupa password)
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

Durasi expired link invitation: **30 menit** (owner, 29 Okt 2026 —
perubahan dari 60 menit default). Nilai 30 menit = **1800 detik**.

Setting ini ada di **Supabase Dashboard → Authentication → Settings**
(token expiry untuk invite/magic link/verifikasi) atau via CLI:

```bash
supabase secrets set GOTRUE_MAIL_VERIFY_EXPIRY=1800
# lalu restart/redeploy Supabase Auth
```

Link fallback (`generateLink`) memakai token yang sama, jadi ikut ter‑update
dengan setting ini. Link yang sudah terbit sebelumnya **tidak terpengaruh** —
hanya link yang baru yang akan menggunakan 30 menit.

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
