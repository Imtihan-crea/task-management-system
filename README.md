# Task Management System

Aplikasi internal untuk mengelola Project, Workstream, Task, Suggestion, Meeting, user, dan role, lengkap dengan Notifications, email pengingat, dan Activity Log. Dipakai staf kantor KASUAT. Panduan untuk pengguna: [`docs/panduan-pengguna.md`](docs/panduan-pengguna.md).

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

- Next.js 16 (App Router) + TypeScript + Tailwind
- Supabase Auth + PostgreSQL + Row Level Security (akses tulis lewat service role di server)
- Brevo (email transaksional), Sentry (opsional), Drizzle Kit (pembuat skema/migrasi)
- Vercel (hosting + cron harian) dan GitHub (source control)

## Halaman

Rute utama: `/login`, `/accept-invite`, `/reset-password`, `/change-password`, `/dashboard`, `/projects` (+ `[id]`, `new`), `/workstreams`, `/tasks` (+ `[id]`, `new`), `/task-suggestions`, `/meetings`, `/activity`, `/notifications`, `/settings`, `/profile`, `/users` (Admin). Hak akses per role dan halaman: [`docs/rbac-matrix-hasil.md`](docs/rbac-matrix-hasil.md). Semua penjagaan ada di server, bukan hanya menu yang disembunyikan.

## Setup lokal

```bash
npm install
cp .env.example .env.local
npm run dev            # http://localhost:3000
```

Nama variabel di `.env.local` (nilainya jangan pernah di-commit; `.env.example` hanya berisi nama):

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (Supabase Dashboard > Project Settings > API; service role hanya untuk server)
- `APP_URL` (dasar semua link undangan dan email; bukan `NEXT_PUBLIC_SITE_URL`)
- `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, `BREVO_SENDER_NAME` (email; panduan di `docs/setup-email.md`)
- `CRON_SECRET` (menjaga `/api/cron/*`)
- Opsional: `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`, `APP_TIMEZONE` (bawaan `Asia/Jakarta`)

**Peringatan:** `.env.local` di laptop pengembang biasanya menunjuk database **produksi**. Jangan menjalankan skrip yang menulis data tanpa membaca bagian e2e di bawah.

## Perintah npm

| Perintah | Fungsi |
| --- | --- |
| `npm run dev` / `build` / `start` | server pengembangan, build produksi, jalankan hasil build |
| `npm run lint` | ESLint |
| `npm run test:logic` | semua tes logika murni (waktu, aturan meeting, email, digest, alur task, password, izin, akses task/project, status user, batas form) **ditambah** `check:secrets`; tanpa database |
| `npm run test:<nama>` | satu tes saja (mis. `test:permissions`, `test:rules`, `test:task-access`) |
| `npm run check:secrets` | memindai file ter-track git untuk secret dan email asli; wajib bersih sebelum commit |
| `npm run test:rls` | uji kebijakan RLS terhadap database |
| `npm run test:db` | tes pembentuk filter PostgREST |
| `npm run emails:render` | merender 18 template email dengan data palsu dan memeriksa escape/tautan (tidak mengirim email) |
| `npm run e2e:smoke` / `e2e:write` / `e2e:rbac` / `e2e:a3` / `e2e:a11y` / `e2e:mobile` / `e2e:perf` / `e2e:cleanup` | uji browser Playwright (lihat di bawah) |
| `npm run db:generate` / `db:check` / `db:status` | Drizzle Kit dan status migrasi |
| `npm run db:backup` | cadangan database ke `private/backups/` (lihat `docs/backup.md`) |

## Uji e2e dan keselamatan terhadap produksi

Skrip di `scripts/e2e/` menjalankan browser sungguhan dan **bukan** bagian `test:logic` maupun CI. Karena database lokal adalah produksi, aturan ini wajib (rinci di [`scripts/e2e/README.md`](scripts/e2e/README.md)):

1. Skrip menolak jalan kecuali `E2E_CONFIRM_PRODUCTION=ya` di-set.
2. `BASE` harus `http://localhost:<port>` (bawaan `http://localhost:3100`).
3. Server uji harus dimulai dengan email mati (`BREVO_API_KEY` dan `BREVO_SENDER_EMAIL` kosong); skrip menolak jalan bila kunci email aktif.
4. Semua data uji berawalan `UJI-E2E` (user `uji-e2e-...@example.com`). Skrip menghapusnya di akhir; `npm run e2e:cleanup` menyapu sisa dan harus melaporkan semua 0.
5. Sesi admin memakai user ADMIN sementara yang dibuat dan dihapus skrip; akun admin produksi tidak disentuh.
6. Satu `next start` di port 3100, jangan `next dev` (RAM terbatas).

## Deploy dan CI

- **Deploy:** setiap push ke `main` di-deploy otomatis oleh Vercel ke https://kasuat-task.vercel.app. Jangan mengisi Output Directory di Vercel. Env var Vercel: nama sama seperti di atas, `APP_URL` untuk Production **dan** Preview. `vercel.json` menjadwalkan `/api/cron/deadlines` setiap hari pukul 00.00 UTC (07.00 WIB); pengingat meeting dipanggil tiap 15 menit oleh `pg_cron` Supabase ke `/api/cron/meetings`.
- **CI** (`.github/workflows/ci.yml`) sengaja hemat: hanya jalan untuk perubahan penting, dengan filter path `app/actions/**`, `app/api/**`, `lib/auth/**`, `lib/supabase/**`, `lib/email/**`, `lib/notifications/**`, `lib/monitoring/**`, `lib/data/**`, `lib/forms/**`, `instrumentation*.ts`, `database/**`, `proxy.ts`, `next.config.ts`, `package.json`, `package-lock.json`, dan `.github/workflows/**`. Langkahnya: audit dependensi, typecheck, lint, `test:logic`, build. Perubahan UI atau dokumen tidak memicu CI; tes lokal harus lulus sebelum push.
- Supabase: Authentication > URL Configuration, **Site URL** wajib `https://kasuat-task.vercel.app` dan Redirect URLs `https://kasuat-task.vercel.app/**` (serta `http://localhost:3000/**` untuk pengembangan).

## Setup Supabase (sekali saja)

1. SQL Editor: jalankan berurutan semua berkas `database/migrations/001` sampai `015` (satu per satu, tiap berkas salin lalu **Run**).
2. Authentication > Users > Add user: buat Admin pertama (centang Auto Confirm User), lalu Table Editor > `profiles` > ubah `role` menjadi `ADMIN` dan `status` menjadi `ACTIVE`.

`profiles.status` adalah satu-satunya sumber kebenaran: `INVITED` (belum membuat password), `ACTIVE` (bisa Login), `INACTIVE` (ditolak). `is_active` hanya kolom turunan.

## Onboarding dan password

- **Undang User:** Supabase mengirim email undangan; user membuka Link, membuat password (minimal 8 karakter), status menjadi `ACTIVE`. Bila email gagal (kuota gratis terbatas), aplikasi membuat user dan menampilkan Link sekali pakai untuk dikirim manual. Link memakai `APP_URL`.
- **Buat User dengan Password:** admin mengetik password awal (minimal 6 karakter), user langsung `ACTIVE`; opsi "Wajib ganti Password saat Login pertama" mengarahkan ke `/change-password` (minimal 8 karakter). Penggantian dilakukan di server (`setOwnPassword`), bukan di browser.
- **Lupa password:** belum ada tombol mandiri. Admin membuat "Link reset Password" di halaman Ubah User; Link menuju `/reset-password`.
- Kedaluwarsa Link undangan: 30 menit (`GOTRUE_MAIL_VERIFY_EXPIRY=1800` di Supabase). Email Supabase gratis: sekitar 2 per jam, hanya ke anggota tim; untuk produksi konfigurasikan SMTP sendiri (`docs/setup-email.md`).

## Aturan data privat

Repo ini tidak boleh menyimpan atau mencetak secret, token, Link undangan/recovery, password, atau email dan data pribadi user. Aturan lengkap di `AGENTS.md`; `npm run check:secrets` memeriksanya. Bila secret terlanjur ter-commit: rotasi dulu, baru bersihkan histori.

## Struktur proyek

```
app/            halaman (App Router), app/actions (server action), app/api (cron, notifikasi)
components/     komponen UI per modul (tasks, projects, meetings, users, ...)
lib/            auth (izin), data, supabase, email, notifications, meetings, utils
database/       migrasi SQL (001-015) dan tes RLS
scripts/        check-secrets, db-backup, render-emails, e2e (Playwright)
tests/          tes logika (tsx)
docs/           dokumentasi (indeks di bawah)
proxy.ts        penjaga rute dan sesi (pengganti middleware di Next 16)
```

## Indeks dokumen (`docs/`)

Panduan dan operasional
- [`panduan-pengguna.md`](docs/panduan-pengguna.md): panduan staf kantor.
- [`ui-bahasa.md`](docs/ui-bahasa.md): aturan bahasa UI (campur Indonesia + istilah inti Inggris).
- [`setup-email.md`](docs/setup-email.md): konfigurasi SMTP/Brevo.
- [`backup.md`](docs/backup.md): cadangan dan restore database.
- [`monitoring.md`](docs/monitoring.md): alert error dan Sentry.
- [`acceptance-test.md`](docs/acceptance-test.md): daftar uji penerimaan manual.

Audit dan hasil uji
- [`audit-ui-rbac.md`](docs/audit-ui-rbac.md): audit UI/alur/RBAC dan tindak lanjutnya (termasuk kerja AFK lanjutan).
- [`rbac-matrix-hasil.md`](docs/rbac-matrix-hasil.md): matriks akses per role hasil e2e.
- [`review-admin-client.md`](docs/review-admin-client.md): review pemakaian `createAdminClient()`.
- [`review-rls.md`](docs/review-rls.md): review kebijakan RLS dan usulan SQL.
- [`laporan-data-2026-11-09.md`](docs/laporan-data-2026-11-09.md): konsistensi data produksi.
- [`a11y-hasil.md`](docs/a11y-hasil.md): audit aksesibilitas.
- [`mobile-hasil.md`](docs/mobile-hasil.md): cek tata letak mobile.
- [`email-hasil.md`](docs/email-hasil.md): pemeriksaan template email.
- [`performa-hasil.md`](docs/performa-hasil.md): pengukuran performa.

Rencana dan laporan fase
- [`plan-rbac.md`](docs/plan-rbac.md), [`plan-phase11-meetings.md`](docs/plan-phase11-meetings.md)
- [`acceptance-report-phase2.md`](docs/acceptance-report-phase2.md), [`acceptance-report-phase34.md`](docs/acceptance-report-phase34.md)
- [`completion-report-phase34.md`](docs/completion-report-phase34.md), [`completion-report-phase57.md`](docs/completion-report-phase57.md), [`completion-report-phase89.md`](docs/completion-report-phase89.md), [`completion-report-phase10.md`](docs/completion-report-phase10.md), [`completion-report-phase10-performance-orm.md`](docs/completion-report-phase10-performance-orm.md), [`completion-report-phase11-meetings.md`](docs/completion-report-phase11-meetings.md)

## Troubleshooting

| Gejala | Penyebab dan solusi |
| --- | --- |
| "Tidak dapat mengundang user" | Lihat log Vercel, baris `[invite] Supabase error:`. `redirect_to ... not allowed`: set `APP_URL` untuk Preview juga. `rate limit`: kuota email habis, pakai Link manual atau SMTP sendiri. |
| "Email ini masih terdaftar di Supabase Auth" | Menghapus baris `profiles` tidak menghapus user Auth. Hapus di Supabase Dashboard > Authentication > Users. |
| Link undangan atau reset dianggap kedaluwarsa | Link sekali pakai. Admin membuat Link baru di halaman Ubah User. |
| Link undangan mengarah ke `localhost` | Site URL Supabase atau `APP_URL` salah (lihat Deploy dan CI). |
