# Completion Report — Phase 11 (Meeting Management & Scheduler)

**Tanggal:** 5 Oktober 2026
**PRD:** `PRD-11-Meeting-Management-Scheduler.md`
**Rencana:** `docs/plan-phase11-meetings.md` (disetujui owner 4 Oktober 2026)
**Status:** selesai — 13 bucket dikerjakan, 1 dilewati sesuai keputusan (OAuth Phase 12)

---

## 1. Ringkasan Bucket

| # | Bucket | Commit | Status |
| --- | --- | --- | --- |
| 1 | DB model (`008_meetings.sql` + Drizzle 5 tabel, 0 drift) | `64b2a16` + fix `3571dcd` | ✅ + diverifikasi live |
| 2 | Permission + types + enum notifikasi/activity | `685465a` | ✅ |
| 3 | Data layer + waktu Jakarta + pure rules + boundary tests | `920c029` | ✅ 73/73 tes |
| 4 | Server actions (21 action, idempoten) | `c2fce10` | ✅ klaim atomik 7/7 live |
| 5 | Global dashboard + KPI + 5 tab + filter + nav | `5a22fdb` | ✅ |
| 6 | Create global + project terkunci | `45f9904` + fix `ab4d3de` | ✅ |
| 7 | Tab Meetings di Project Detail | `7da5f51` | ✅ |
| 8 | Meeting detail workspace 6 tab | `6a0783a` | ✅ |
| 9 | Task SOURCE traceability | `d9ac0a8` | ✅ |
| 10 | Activity + notification (audit coverage) | — (terbukti di bucket 4) | ✅ |
| 11 | Scheduler + cron route | `69cc744` | ✅ diverifikasi live |
| 12 | Settings Integrations | `0e6b952` | ✅ |
| 13 | Google OAuth | — | ⏭️ DILEWATI (Opsi A, Phase 12) |
| 14 | Regression | laporan ini | ✅ |
| 15 | Laporan | file ini | ✅ |

---

## 2. Yang Dibangun

### Database (migrasi `008_meetings.sql`, 502 baris)

5 tabel baru + 3 kolom, **nol DROP**:

- `meetings` (23 kolom, code `M-001` dari sequence, `project_id` nullable)
- `meeting_participants` (internal XOR eksternal, unique per user)
- `meeting_agendas` (`position` untuk reorder)
- `meeting_decisions` (editable individual)
- `meeting_action_items` (`task_id` = link + idempotency guard)
- `tasks` +`source_type`/`source_id`, `notification_preferences` +`email_meeting_updates`
- Function `can_read_meeting()` (security definer — anti infinite recursion RLS)
- 6 policy RLS + perluasan policy `activity_logs`
- Index parsial Needs Notes: `WHERE status='COMPLETED' AND coalesce(btrim(notes),'')=''`

Dua penyimpangan dari PRD §40 (disetujui): `notes_status` dihapus (diturunkan dari
`notes`), traceability pakai kolom di `tasks` (bukan tabel relasi).

### Aplikasi

- **Nav:** Meetings di group COLLABORATION + ikon kalender SVG
- **`/meetings`:** KPI (4+2), 5 tab ber-count, filter (search/project/type/status/
  organizer/date range), kartu mobile + tabel desktop, 4 Suspense boundary
- **`/meetings/new`:** global + `?project=` terkunci (read-only + hidden input)
- **Project Detail:** tab Meetings (ke-4) + tombol + New Meeting
- **`/meetings/[id]`:** header (§14) + 6 tab (overview/agenda/notes/decisions/
  actions/activity), lifecycle dengan ringkasan §41, retry sync
- **Task Detail:** blok SOURCE (§21) untuk MEETING/SUGGESTION/IMPORT
- **Scheduler:** `/api/cron/meetings` (GET+POST, Bearer CRON_SECRET) — reminder
  30-menit + notes follow-up, event_key per hari (idempoten)
- **Settings:** section Integrations → Google Calendar (fondasi)

### Aturan yang dijaga

- `emitNotification()` dan `logActivity()` **tidak diubah** — hanya enum
- `todayISO()` (UTC) **tidak disentuh** — meeting pakai helper Jakarta sendiri
- `app/actions/tasks.ts` logic **tidak disentuh** (hanya blok SOURCE di UI)
- Semua tulis lewat service role + cek server; RLS tolak tulis anon (terbukti: 401)

---

## 3. Verifikasi (angka, bukan klaim)

| Cek | Hasil |
| --- | --- |
| Kolom DB vs Drizzle | **58/58 cocok**, 15 tabel, 0 kurang/lebih |
| Constraint (8 kasus invalid) | semua ditolak (400/409) |
| RLS anon 5 tabel | **0 baris semua**, tulis → 401 |
| `drizzle-kit generate` ulang | `No schema changes` (0 drift) |
| Klaim atomik task (live) | **7/7** (klaim kedua 0 baris) |
| Scheduler (live, tanpa side effect) | query benar, 0 emit tanpa peserta, bersih |
| `npm run test:logic` | **81/81** (50 waktu + 31 rules) |
| `npm run test:db` (PostgREST `or=`) | **7/7** |
| `tsc --noEmit` | bersih |
| `lint` | 0 error (1 warning lama `<img>`) |
| `build` | sukses, route `/meetings*` + `/api/cron/meetings` terdaftar |
| Production | `/login` 200, 8 route protected 307, cron tanpa secret **401** |
| Secret | tidak ada `.env` ter-track, tidak ada JWT/key di kode |

Query `/meetings`: scope (2, PM 3) + meetings 1 + participants 1 + actions 1 +
projects 1 + users 1 + KPI actions 1 = **7–8 query @~5–15 ms** (region `icn1`).
Satu query utama dipakai bersama Tabs + Results + KPI via `cache()`.

---

## 4. Acceptance Criteria (PRD §46) — jujur

### Meeting Core — ✅ semua
Nav, dashboard global, create global, create dari project, project terkunci,
detail, agenda (CRUD+reorder), notes (plain text, bisa setelah COMPLETED),
decisions, action items, participants (+attendance, +eksternal siap),
lifecycle DRAFT→SCHEDULED→COMPLETED, cancel dari DRAFT/SCHEDULED.

### Task Integration — ✅ semua
Mapping §20, project diwarisi (meeting tanpa project ditolak dengan pesan jelas),
link Meeting→Task (→ T-081) dan Task→Meeting (blok SOURCE), idempoten
(terbukti live: task kedua tidak pernah dibuat).

### Scheduler — ✅ kode, ⏳ butuh 1 SQL dari owner
Reminder + notes reminder + service existing + idempotency (event_key/hari)
terverifikasi. **Yang belum:** daftarkan `pg_cron` (lihat §6 di bawah).

### Google Calendar — ⏳ fondasi (sesuai Opsi A)
Kolom `google_*`, state machine, checkbox, badge sync, retry terkontrol,
failure-safe (meeting tidak pernah dihapus karena sync gagal).
**Belum:** OAuth connect, create/update/cancel event sungguhan, import
Google→Kasuat. Itu bucket 13 → Phase 12 (butuh Client ID/Secret + keputusan
Testing-vs-Verifikasi, lihat rencana §14.1).

### UX — ✅ kode, 📱 perlu cek device oleh owner
Desktop/tablet/mobile (kelas responsif + tab scroll horizontal), partial loading
(4 boundary + skeleton), Kasuat UI dipertahankan, Phase 1–10 utuh (8 route
protected tetap 307, `/login` 200). Saya tidak punya login — verifikasi visual
dan alur klik penuh (14 skenario §48) perlu dilakukan owner di production.

---

## 5. Bug yang Ditemukan & Diperbaiki Selama Pengerjaan

1. **`008`: fungsi sebelum tabel** — `check_function_bodies` menolak
   (`relation public.meetings does not exist`). Fungsi dipindah ke bagian 3.
2. **`getMeetingScope()` bocor** — `managedProjectIds` default `null` (= tanpa
   filter, khusus ADMIN) untuk TEAM/VIEWER. Sekarang default `[]`.
   Tanpa ini, member bisa melihat semua meeting.
3. **`scopeFilter()` salah bungkus** — mengembalikan `or=(...)` padahal `.or()`
   butuh isinya saja; hasilnya `or=(or=(...))` dan filter gagal diam-diam.
   Ditangkap oleh boundary test, dibuktikan benar via 7 tes PostgREST live.
4. **Fungsi sync di file `'use server'`** — `canViewMeeting` menggagalkan build
   ("Server Actions must be async functions"). Dipindah ke `lib/meetings/rules.ts`.
5. **Duplikat `isMeetingStatus`** — tertangkap lint, dibersihkan.

---

## 6. Yang Perlu Dilakukan Owner (3 hal)

### A. Reset sequence meeting (1 SQL, opsional tapi disarankan)
Test saya memakai M-001 s/d M-011. Supaya meeting pertama = M-001:
```sql
select setval('public.meeting_code_seq', 1, false);
```

### B. Daftarkan scheduler (1 SQL, WAJIB untuk reminder)
Supabase → SQL Editor → jalankan sekali (ganti secret-nya):
```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'meeting-reminders',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://task-management-system-jatc.vercel.app/api/cron/meetings',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer GANTI_DENGAN_CRON_SECRET_ANDA'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 10000
  );
  $$
);
```
Verifikasi: `select jobname, schedule, active from cron.job;`
`CRON_SECRET` = yang sama dengan `/api/cron/deadlines` (cek Vercel env).

### C. Acceptance test di production (14 skenario PRD §48)
Saya tidak punya akses login. Minimal: buat meeting global → buat dari project
(cek terkunci) → isi agenda/notes/decisions → tambah action item → Create Task
→ klik Create Task lagi (harus "Task already exists") → cek blok SOURCE di task
→ complete meeting → cek Needs Notes → isi notes → cek tab hilang.
Lalu: tambah `?tab=needs_notes` setelah complete tanpa notes.

---

## 7. Follow-up (bukan Phase 11)

- **Phase 12:** Google OAuth penuh (butuh Client ID/Secret + pilih Testing vs
  Verifikasi). Fondasi sudah siap; tinggal pasang token.
- Widget Upcoming Meetings di main dashboard (§33–34) — sengaja tidak dikerjakan
  (di luar bucket rencana; menambah query ke dashboard).
- `getSuggestableProjects()` duplikasi logika dropdown project di 3 tempat
  (`suggestions.ts`, `meetings/new`, `tasks/new`) — kandidat refactor kecil.
- Test `tests/*.check.ts` jalan via `npm run test:logic`/`test:db`, bukan CI.
  Kalau nanti ada GitHub Actions, tinggal panggil script yang sama.

## 8. Regression Statement (§47)

Tidak ada tabel/kolom Phase 1–10 yang diubah secara destruktif (hanya +3 kolom
nullable). Tidak ada logic task/suggestion/notification/activity/email/deadline-
cron yang diubah. `tsc` bersih, `build` sukses, 8 route protected tetap 307,
`/login` 200, cron lama tidak tersentuh (`vercel.json` tidak diubah — Hobby aman).

## 9. Update 6 Okt 2026 — Aturan Notifikasi Post-Completion + Email Hasil Meeting

Keputusan owner:

1. **Edit setelah COMPLETED/CANCELLED → in-app saja, tanpa email.**
   Implementasi: `isHistoricalMeetingStatus()` di `lib/meetings/rules.ts` +
   `notifyContentChange()` (selalu in-app, tidak pernah email) dipanggil dari
   14 titik mutasi konten (notes, agenda ×4, decisions ×3, action items ×3,
   remove participant, attendance, task-from-action). Undangan peserta baru dan
   email "task assigned" ditekan email-nya (`suppressEmail`) kalau meeting sudah
   historical — in-app tetap jalan. Email transisi (create/update/schedule/
   complete/cancel/invite, semua pre-completion) tidak berubah.
2. **Email Completed memuat hasil meeting.** `lib/meetings/completion-email.ts`
   (murni, 25 boundary test): notes (dipotong 3000 karakter) + decisions
   bernomor + action items (assignee/deadline/status/task code) + status kosong
   eksplisit + escape HTML (lolos uji XSS). In-app tetap singkat (judul saja).

Verifikasi saat itu: `test:logic` 121/121, `tsc` bersih, `lint` 0 error, `build` sukses.

## 10. Update 6 Okt 2026 — Gratisan Penuh: Cabut Google UI, Digest Pagi, Brand Email

Keputusan owner: OAuth ditunda, maksimalkan email gratis (internal).

1. **UI Google yang mati dicabut** (commit `7663b0c`): checkbox Add to Calendar,
   kolom/badge Calendar, blok Calendar Sync + Retry, section Settings
   Integrations, action `markMeetingSyncAttempt`, komponen `SyncBadge`/`SyncRetryForm`.
   Kolom DB `google_*` + skema Drizzle dibiarkan (gratis, future-proof).
2. **Layout email brand Kasuat** (commit `3bae4a2`): `lib/email/layout.ts`,
   dibungkus sekali di `sendEmail` (satu choke point → semua email ikut).
   Logo berupa TEKS emas (bukan gambar — Gmail memblokir gambar eksternal),
   inline style, 600px, footer no-reply. Hapus dead code `notifyTaskDone`.
   12 boundary test.
3. **Morning Digest anti-nyampah** (commit `eda815a`): `runMorningDigest()` —
   HANYA meeting hari ini + task due/overdue per user; yang tidak punya apa-apa
   tidak dapat apa-apa. Kategori email sendiri (`digest`) + checkbox opt-out
   (migrasi `009_digest_prefs.sql`, 1 kolom). Digabung ke cron deadline yang
   sudah ada (00:00 UTC = 07:00 WIB) — tanpa jatah cron baru (Hobby aman).
   Dry-run live: 6 user aktif → hanya 1 penerima (1 task overdue). 14 test.

Verifikasi saat itu: `test:logic` 147/147, `tsc` bersih, `lint` 0 error,
`build` sukses, `drizzle-kit generate` → `No schema changes`.

## 11. Update 7 Okt 2026 — Task Workflow: CANCELLED + Tombol Submit + Kunci Done

Permintaan owner (6 poin, semua dikerjakan + 2 penyesuaian):

1. **Status CANCELED** (`CANCELLED`, ikut ejaan `PROJECT_STATUSES`):
   migrasi `010_task_canceled.sql`, CHECK + Drizzle + tipe + badge abu-abu +
   tab Cancelled + semua filter + donut. Progress project/Gantt mengeluarkan
   CANCELED dari total (di luar scope, bukan "belum selesai").
2. **Submit sifatnya tombol + tanggal:** `submitTask` → DONE + `completed_at`,
   `cancelTask` → CANCELLED + `cancelled_at` (idempoten: submit 2× tidak kirim
   email 2×). Dropdown status hanya TODO/IN_PROGRESS/REVIEW/BLOCKED di semua
   form; server menolak terminal lewat jalur lain. Buka ulang (PM/Admin via
   form edit) membersihkan tanggalnya.
3. **Overdue historis:** tab Overdue/KPI/scheduler/digest/workload tidak lagi
   memuat DONE/CANCELLED — tapi badge Overdue tetap tampil bila deadline <
   tanggal submit (bukan hari ini, supaya yang selesai tepat waktu tidak ikut
   dicap). Backfill `completed_at = updated_at` untuk DONE lama.
4. **Row bisa diklik seluruhnya:** pola stretched-link di tabel desktop
   (tetap link semantik + aksesibel; kartu mobile memang sudah full-klik).
5. **Tombol di bawah evidence:** "Submit as Done" (hijau) + "Cancel Task"
   (dengan konfirmasi, karena mengunci). Dropdown Change Status tanpa terminal.
6. **DONE/CANCELLED dikunci:** form status disembunyikan, member lihat pesan
   "minta PM/Admin"; evidence tetap bisa; PM/Admin tetap bisa edit + reopen
   lewat form penuh.

Penyesuaian dari saya (sudah termasuk di atas): ejaan `CANCELLED` (konsisten
dengan `PROJECT_STATUSES`), dan CANCELED keluar dari progress (bukan dihitung
belum selesai).

Verifikasi saat itu: `test:logic` 166/166 (19 test workflow baru), `tsc` bersih,
`lint` 0 error, `build` sukses, `drizzle-kit generate` → `No schema changes`,
`test:db` 7/7. Tombol submit/cancel belum diuji live (kolom DB baru —
jalankan migrasi 010 dulu, lalu test).

## 12. Update 3 Nov 2026 — Add User dengan Password (tanpa link invite)

Latar belakang: email undangan Supabase tidak sampai ke penerima, padahal
user sudah berhasil dibuat (muncul di `profiles` + `auth.users`). Owner
meminta opsi pendaftaran langsung oleh admin dengan email + password.

Keputusan owner (disetujui):
1. **Dua opsi tetap ada** — "Create User with Password" (baru) dan
   "Send Invitation" (lama).
2. Password awal **diketik admin**, minimal **4 karakter**, dengan tombol
   show/hide.
3. **Opsional**: checkbox "Require password change on first login".
4. Update PRD disetujui (usulan teks di bawah).

### Yang dibangun

- **DB**: migrasi `011_must_change_password.sql` +
  `database/drizzle/0004_phase11_must_change_password.sql` —
  `profiles.must_change_password boolean not null default false`.
- **Aturan murni** `lib/auth/password.ts`: password admin min 4, password
  baru pilihan user min 8 (+ konfirmasi). 15 boundary test
  (`tests/auth-password.check.ts`, `npm run test:auth`).
- **Server action** `createUserWithPassword` (`app/actions/users.ts`):
  `admin.auth.admin.createUser({ email, password, email_confirm: true })`
  — **tidak ada email yang dikirim** — lalu profil `ACTIVE` +
  `must_change_password` sesuai checkbox + activity log
  (`via: 'admin-password'`). Error Supabase (mis. minimum password
  project) diteruskan apa adanya ke admin.
- **UI** `components/users/CreateUserForm.tsx`; halaman `/users/new`
  menampilkan dua opsi (Create with Password / atau / Send Invitation);
  tombol di `/users` menjadi "+ Add User".
- **Guard wajib ganti password**: `requireProfile()` mengalihkan ke
  `/change-password` selama flag aktif (tanpa redirect loop —
  `requireProfileForPasswordChange()` khusus halaman itu); `LoginForm`
  juga mengarahkan ke `/change-password` setelah login.
- **Halaman** `/change-password` + `ChangePasswordForm` +
  `completePasswordChange()`: password diubah lewat sesi user
  (`supabase.auth.updateUser`), lalu server action (service role)
  membersihkan flag + activity log. Halaman ini juga bisa dibuka sukarela
  kapan saja.
- **Tidak ada perubahan** pada invite flow lama, task, meeting,
  suggestion, notifikasi, RLS, atau scheduler.

### Catatan penting untuk owner

- Password awal **diketahui admin** — konsekuensi yang disadari. Centang
  "Require password change on first login" untuk mitigasi.
- **Supabase punya minimum password sendiri (default 6).** Kalau ingin
  benar-benar menerima 4 karakter, turunkan di
  **Supabase Dashboard → Authentication → Settings → Password minimum
  length** menjadi 4. Tanpa itu, password 4–5 karakter akan ditolak
  Supabase dengan pesan yang diteruskan ke admin.

### Usulan teks PRD (disetujui owner)

> **User Management — Pembuatan User.** Admin dapat membuat user dengan
> dua cara: (a) membuat langsung dengan email + password awal yang
> diketik admin (minimal 4 karakter; user langsung ACTIVE; tanpa email),
> atau (b) mengirim undangan email (user membuat password sendiri;
> status INVITED → ACTIVE). Keduanya menyediakan opsi opsional "wajib
> ganti password saat login pertama"; bila aktif, semua halaman internal
> dialihkan ke /change-password sampai password diganti. Admin yang
> membuat password awal bertanggung jawab membagikannya lewat kanal
> aman. Password baru pilihan user minimal 8 karakter. Operasi tulis
> tetap hanya lewat service role + otorisasi server.

### Verifikasi

`test:logic` **181/181** (60+36+25+12+14+19+15), `tsc` bersih, `lint`
0 error, `build` sukses, `drizzle-kit generate` → `No schema changes`.

### Langkah owner

1. ~~Jalankan `database/migrations/011_must_change_password.sql` di Supabase
   SQL Editor (wajib — kolom baru).~~ **Sudah dijalankan 7 Nov 2026**
   (lihat §19).
2. Opsional: turunkan Supabase password minimum length ke 4.
3. Deploy Ready + hard-refresh, lalu test:
   - Create User with Password (tanpa centang) → login langsung berhasil.
   - Create User dengan centang → login → diarahkan ke /change-password →
     ganti password → dashboard.
   - Send Invitation tetap berfungsi seperti sebelumnya.

## 13. Update 5 Nov 2026 — Pindah domain ke `kasuat-task.vercel.app`

Gejala: owner tidak bisa membuka `https://task-management-system-jatc.vercel.app`
di laptop maupun HP, baik di WiFi kantor maupun provider biasa ("blank hitam,
then cannot be reached"). URL preview deployment bisa dibuka.

Hasil diagnosis:
- Server sehat: 40 node check-host (termasuk **Jakarta**) → HTTP 200 semua;
  TLS valid; 7 IP Vercel diuji manual → 200 semua.
- Build preview identik dengan production (hash chunk `37E882D65EA87EB7`).
- Google Safe Browsing: bersih (status 6) untuk kedua hostname.
- Server tidak punya AAAA, jadi bukan masalah IPv6.
- Kesimpulan: filter DNS/SNI **per-nama-domain** di jalur jaringan owner,
  bukan masalah aplikasi/Vercel. Karena preview (IP sama) bisa dibuka,
  yang diblokir adalah hostname-nya.

Tindakan: project Vercel di-rename menjadi `kasuat-task`, sehingga domain
produksi baru `https://kasuat-task.vercel.app`. Repo (README) diperbarui ke
domain baru; push ke `main` memicu deployment yang mengikat alias baru.

Langkah owner yang WAJIB:
1. Vercel → Settings → Environment Variables → `APP_URL` =
   `https://kasuat-task.vercel.app` (Production + Preview), lalu Redeploy.
2. Supabase → Authentication → URL Configuration → Site URL dan Redirect
   URLs diarahkan ke `https://kasuat-task.vercel.app`.
3. (Opsional) ganti URL cron di Supabase (`cron.job`) ke domain baru,
   karena domain lama bisa berhenti melayani kapan saja.

Catatan: domain lama masih mengembalikan 200 sampai deployment baru masuk.
`kasuat-task.vercel.app` sempat mengembalikan `DEPLOYMENT_NOT_FOUND`
sebelum deploy pertama setelah rename — normal.
## 14. Update 5 Nov 2026 — Halaman `/reset-password` (link recovery)

Masalah yang dilaporkan owner: link recovery Supabase untuk akun admin
utama menghasilkan "This page couldn't load".

Dua penyebab:
1. Link mengarah ke `https://kasuat-task.vercel.app` yang saat itu belum
   terhubung ke deployment (`DEPLOYMENT_NOT_FOUND`) karena alias baru
   belum di-assign. Sekarang sudah 200.
2. **Bug aplikasi:** `app/page.tsx` memperlakukan SEMUA hash auth
   (`access_token` / `token_hash` / `error_code`) sebagai undangan dan
   mengarahkannya ke `/accept-invite`. Link recovery (`type=recovery`)
   jadi diverifikasi dengan `verifyOtp({ type: 'invite' })` dan selalu
   gagal. Tidak ada halaman reset password sama sekali.

Perbaikan:
- **Halaman baru** `app/reset-password/page.tsx` yang menangani tiga bentuk
  link: `#access_token` (implicit), `#token_hash&type=recovery`, dan
  `?code=` (PKCE). Client memakai flow PKCE, jadi token implicit di-set
  manual lewat `setSession` (pola yang sama dengan `/accept-invite`).
- Password baru: minimal **8 karakter** + konfirmasi
  (`validateSelfPassword`), diubah lewat sesi user
  (`supabase.auth.updateUser`), lalu `completePasswordChange()` membersihkan
  flag `must_change_password` dan menulis activity log.
- `app/page.tsx` sekarang memisahkan `type=recovery` → simpan hash di
  `tms:recovery-hash` → arahkan ke `/reset-password`.
- `lib/supabase/proxy.ts`: `/reset-password` masuk `PUBLIC_PATHS` dan
  `isTokenEntry` supaya server tidak redirect sebelum browser membaca token.

Verifikasi: `tsc` bersih, `lint` 0 error, `build` sukses, route
`/reset-password` terdaftar sebagai static page.

Catatan: link recovery hanya bisa dipakai **sekali** dan kedaluwarsa
(default 1 jam). Setelah deploy, minta link baru dari Supabase Dashboard
(Authentication → Users → user → Send recovery).
## 15. Update 5 Nov 2026 — Perbaikan "Your session has expired" di /reset-password

Gejala: user membuka link recovery, halaman menampilkan email-nya, lalu saat
klik **Save New Password** muncul "Your session has expired. Please log in
again." — padahal password sudah berhasil diubah.

Penyebab: setelah `updateUser({ password })`, kode lama memanggil
`supabase.auth.refreshSession()`. Pada sesi hasil recovery, rotasi refresh
token bisa membuat sesi langsung dibuang; server action
`completePasswordChange()` lalu tidak menemukan user dan mengembalikan pesan
"session expired".

Perbaikan:
1. `refreshSession()` dihapus dari `/reset-password` dan `/change-password`.
2. `completePasswordChange(accessToken?)` sekarang menerima access token
   sebagai jalur cadangan: server memverifikasinya lewat
   `auth.getUser()` + service role, jadi profil tetap ditemukan walau cookie
   sesi belum terbaca.
3. Kalau pembersihan flag tetap gagal, user **tidak** diminta mengulang
   reset — password sudah tersimpan; guard `/change-password` menangani
   flag yang tersisa.

Verifikasi: `tsc` bersih, `lint` 0 error, `test:logic` 181/181, `build`
sukses.

Catatan soal masa berlaku: link recovery memakai setting email OTP Supabase
(`Authentication → Providers → Email → Email OTP Expiration`, default
3600 detik). Kalau owner ingin link lebih panjang, ubah di sana — tapi
setting yang sama juga memperpanjang link undangan (owner sebelumnya
memilih 30 menit untuk undangan).
## 16. Update 6 Nov 2026 — Login "Something went wrong" karena migrasi 011 belum jalan

Gejala: login dengan email + password yang benar selalu berakhir
"Something went wrong. Please try again." (bukan "Invalid email or password"),
jadi autentikasi Supabase berhasil tapi profil gagal dibaca.

Diagnosis langsung ke database (service role, REST):
- `select=must_change_password` -> HTTP 400, kode **42703**:
  `column profiles.must_change_password does not exist`
- `select=status` -> 200 (kolom lain normal)
- `tasks.completed_at` / `cancelled_at` -> 200 (migrasi 010 SUDAH jalan)

Artinya migrasi `011_must_change_password.sql` belum dieksekusi. LoginForm dan
`getCurrentProfile()` memilih kolom itu, sehingga error dan login diblokir
untuk SEMUA user.

Perbaikan:
1. **Wajib:** jalankan `database/migrations/011_must_change_password.sql`
   di Supabase SQL Editor.
2. **Ketahanan aplikasi** (supaya satu migrasi yang tertunda tidak
   melumpuhkan login):
   - `lib/auth/session.ts`: kalau error 42703, baca profil tanpa kolom baru
     dan anggap `must_change_password = false` (dengan peringatan log).
   - `components/auth/LoginForm.tsx`: fallback yang sama.
   - `app/actions/password.ts`: 42703 dianggap sukses (tidak ada flag yang
     perlu dibersihkan).
   - `app/actions/users.ts` (`createUserWithPassword`): update/insert diulang
     tanpa `must_change_password` bila kolom belum ada.

Verifikasi: `tsc` bersih, `lint` 0 error, `test:logic` 181/181, `build` sukses.

Catatan: fallback hanya jaring pengaman. Flag "wajib ganti password" TIDAK
berfungsi sampai migrasi 011 dijalankan.

**Update 7 Nov 2026:** migrasi 011 sudah dieksekusi (lihat §19). Flag
`must_change_password` sekarang berfungsi; fallback 42703 tetap dipertahankan
sebagai jaring pengaman kalau kolom hilang di environment lain.
## 17. Update 7 Nov 2026 — Aturan satu alamat resmi

Permintaan owner: "main hanya satu yaitu https://kasuat-task.vercel.app/login".

Masalah: setelah project Vercel di-rename, domain lama
(`task-management-system-jatc.vercel.app`) TETAP aktif dan menyajikan build
yang sama. Ditambah URL preview per-deployment, jadi ada beberapa alamat yang
beredar dan membingungkan.

Aturan yang ditetapkan:
- Alamat resmi satu-satunya: **https://kasuat-task.vercel.app**
  (login: `/login`).
- Semua akses **GET/HEAD** lewat host lama (domain produksi lama dan URL
  preview `task-management-system-jatc-…`) dialihkan **308** ke alamat resmi,
  path + query dipertahankan.
- **POST tidak dialihkan** — cron Supabase memakai `pg_net` yang tidak
  mengikuti redirect; kalau ikut dialihkan, pengingat deadline bisa berhenti.
- Host resmi, localhost, dan URL preview project baru tidak dialihkan.

Implementasi:
- `lib/config/canonical.ts` — konstanta + `normalizeHost()`, `isLegacyHost()`,
  `canonicalUrl()`, `shouldRedirectMethod()`.
- `lib/supabase/proxy.ts` — redirect 308 di awal `updateSession()`.
- `tests/canonical.check.ts` — 27 boundary test (`npm run test:canonical`,
  masuk `test:logic`).
- README bagian Production diperbarui.

Catatan: redirect ini tidak menolong owner di jaringan yang memblokir domain
lama (blokir terjadi sebelum request sampai ke Vercel), tapi membuat semua
link lama di sisi lain otomatis menuju satu alamat.
## 18. Update 7 Nov 2026 — Aturan data privat + pemeriksa otomatis

Permintaan owner: pastikan semua yang privat di-redact, dan jadikan aturan
untuk repo ini.

Audit awal:
- `.env.local` **tidak** ter-track git (hanya `.env.example` yang berisi
  placeholder). `.gitignore` sudah mengecualikan `.env*`.
- Tidak ada service role key, PAT Supabase, Brevo key, connection string
  Postgres, atau private key di file yang ter-track.
- Ditemukan **email pribadi** di `docs/acceptance-report-phase2.md` dan
  `docs/setup-email.md` (2 baris) — sudah diganti `nama@contoh.com`.
- Hit `eyJ…` di `package-lock.json` adalah false positive (bagian base64
  integrity), bukan token.

Yang dibuat:
- **`AGENTS.md`** bagian **Aturan Data Privat (WAJIB)**: daftar yang dianggap
  privat, larangan mencetak/meng-commit, kewajiban placeholder, rotasi saat
  bocor, dan kewajiban menjalankan pemeriksa sebelum commit.
- **`scripts/check-secrets.mjs`** (`npm run check:secrets`): memindai file
  ter-track git untuk JWT/token, Supabase PAT, Brevo key, OpenAI-style key,
  GitHub/Google key, Postgres URI berpassword, private key, assignment secret
  non-placeholder, dan email non-placeholder. Nilai temuan **tidak dicetak**,
  hanya `file:baris`.
- Pemeriksa ikut dijalankan di `npm run test:logic`.
- README bagian **4d. Aturan data privat**.

Verifikasi: self-test dengan file sementara berisi token + email palsu →
terdeteksi 2 temuan; setelah dihapus → `BERSIH`.

## 19. Update 7 Nov 2026 — Migrasi 011 dijalankan + password admin direset

Permintaan owner: "jalankan keduanya" (migrasi 011 dan reset password admin).

### Migrasi 011

Service role key hanya bisa akses data lewat REST, **tidak bisa** DDL, dan
tidak ada connection string Postgres/PAT di environment. Migrasi akhirnya
dijalankan lewat **Supabase Dashboard → SQL Editor** di tab browser yang sudah
login (owner login sendiri; kredensial tidak dibaca atau disimpan).

SQL yang dieksekusi:

```sql
alter table public.profiles
  add column if not exists must_change_password boolean not null default false;
```

Verifikasi langsung via REST (service role):

| Pemeriksaan | Hasil |
|---|---|
| `select=id` | 11 profile terbaca |
| `select=must_change_password` | **HTTP 200** (sebelumnya 400 / `42703`) |
| `must_change_password=eq.true` | 0 baris |
| query persis LoginForm (`id,email,full_name,role,status,must_change_password`) | HTTP 200 |

Tidak ada data yang berubah; semua user lama otomatis `false`. Fitur "wajib
ganti password saat login pertama" sekarang aktif. Fallback `42703` tetap
dipertahankan sebagai jaring pengaman.

### Reset password admin

Dilakukan lewat Supabase Admin API (`PUT /auth/v1/admin/users/{id}`) memakai
service role; password **tidak** dicetak di laporan ini.

Verifikasi end-to-end di production: `/login` → berhasil masuk `/dashboard`
("Selamat datang, …"), profil `ACTIVE` / role `ADMIN`.

### Uji end-to-end "wajib ganti password" (7 Nov 2026)

Dijalankan dengan user percobaan lewat UI production, lalu dihapus lagi.

| # | Uji | Hasil |
|---|---|---|
| 1 | Admin buat user + centang *Require password change* | Profil `ACTIVE`, `TEAM_MEMBER`, flag `true` |
| 2 | Login user tersebut | Dialihkan ke `/change-password` |
| 3 | Buka `/dashboard` paksa | Tetap dialihkan ke `/change-password` |
| 4 | Ganti password (min 8) | Masuk `/dashboard`, flag otomatis `false` |
| 5 | Login ulang | Password lama **ditolak** (HTTP 400), password baru **berhasil** |

Pembersihan: profil + auth user percobaan dihapus (total profil kembali 11,
tidak ada sisa user). Satu baris activity log `USER_CREATED` tetap tersimpan
sebagai audit — sesuai desain.

### Cron dipindah ke domain resmi (7 Nov 2026)

Job `pg_cron` yang ada dicek lewat SQL Editor:

| Field | Nilai |
|---|---|
| `jobid` / `jobname` | `1` / `meeting-reminders` |
| `schedule` | `*/15 * * * *` |
| `active` | `true` |
| URL sebelum | `https://task-management-system-jatc.vercel.app/api/cron/meetings` |

Diubah dengan `cron.alter_job` + `replace()` pada kolom `command`, sehingga
header `Authorization` (Bearer `CRON_SECRET`) **tidak berubah** — nilainya tidak
pernah ditulis ke laporan.

Verifikasi sesudah:

| Pemeriksaan | Hasil |
|---|---|
| URL memakai `https://kasuat-task.vercel.app/api/cron/` | ✅ true |
| Masih mengandung `task-management-system-jatc` | ✅ false |
| Header `Bearer` masih ada | ✅ true |
| Job tetap `active` | ✅ true |

Tidak ada job cron lain. Panduan `cron.alter_job` juga ditambahkan ke
`docs/plan-phase11-meetings.md` §10.4.

### Sisa opsional

- (tidak ada — semua item yang direncanakan sudah dijalankan)

## 20. Update 7 Nov 2026 — Rotasi `CRON_SECRET`

Latar: saat memeriksa isi job `pg_cron`, header `Authorization` ikut
terbaca di log internal sesi. Sesuai **Aturan Data Privat** di `AGENTS.md`,
nilai tersebut dianggap bocor dan harus dirotasi.

Langkah yang dilakukan:

1. Generate secret baru **64 karakter hex** (tidak pernah dicetak atau
   disimpan di repo).
2. Vercel → Settings → Environment Variables → `CRON_SECRET`
   (Production and Preview). Vercel mewajibkan **verifikasi email 6 digit**
   sebelum nilai sensitif bisa diubah; verifikasi diselesaikan oleh owner.
3. Simpan nilai baru, lalu **Redeploy** deployment production terakhir dan
   tunggu status **Ready**.
4. Update job `pg_cron` `meeting-reminders` dengan
   `cron.alter_job` + `regexp_replace(command, 'Bearer [^'']+', …)` sehingga
   hanya token yang berubah; URL tetap domain resmi dan jadwal tetap
   `*/15 * * * *`.
5. `.env.local` lokal diperbarui (untracked, nilainya tidak dicetak).

Verifikasi:

| Pemeriksaan | Hasil |
|---|---|
| Request dengan secret **lama** | **401** (ditolak) |
| Request dengan secret **baru** | **200** (diterima) |
| Job `active` | true |
| URL domain resmi | true |
| Domain lama tersisa | false |
| Token baru berformat 64 hex | true |

Catatan: selama jendela rotasi, paling buruk satu tick 15 menit terlewat.
Scheduler memindai semua item yang jatuh tempo, jadi tick berikutnya
mengejar — tidak ada pengingat yang hilang.

Setelah selesai: file sementara dan clipboard dibersihkan; tidak ada nilai
secret yang tercatat di repo, dokumen, atau laporan ini.