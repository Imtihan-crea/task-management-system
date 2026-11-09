# Audit UI, alur, form, dan RBAC

Tanggal: 8 Nov 2026 (dini hari WIB). Basis kode: `main` = `2cc9920`.
Jenis: audit **baca kode** + cek otomatis + cek data produksi baca-saja.
Tidak ada tombol yang ditekan di produksi; tidak ada kode yang diubah saat
audit.

Label kolom **Bukti**: `TERBUKTI` = dibaca ulang langsung di kode/dijalankan
saat menyusun laporan; `AUDIT` = temuan subagen review yang belum dibaca ulang
satu per satu (tetap berbasis kode, dengan path:line); `VERIFIKASI` = perlu dicek
di browser atau keputusan pemilik.

## Ringkasan

- **Kritis/Tinggi: 13 temuan.** Dua yang bisa merusak data diam-diam:
  edit task DONE membukanya lagi; organizer/PM/assignee nonaktif hilang
  diam-diam saat form disimpan. Dua celah izin: PM peserta meeting bisa
  mengelola meeting project lain; wajib-ganti-password bisa dilewati.
- Guard server untuk semua halaman sensitif **sudah ada** (bukan cuma menu
  disembunyikan); 18 halaman + 3 API menolak user belum login.
- Banyak tombol yang **tampil tapi pasti ditolak server**, link yang berakhir
  404, dan form yang kosong lagi setelah error.
- Bahasa UI campur Inggris (label, tombol, pesan) dan Indonesia (placeholder,
  bantuan, login, email).

## Cek otomatis (fase 5)

| Cek | Hasil |
| --- | --- |
| `npx tsc --noEmit` | exit 0 |
| `npx eslint .` | exit 0, tanpa peringatan |
| `npm run test:logic` | exit 0, 369 cek lulus |
| `npm audit --omit=dev --audit-level=high` | exit 0 |
| `next build` | exit 0 |
| Tanpa login (dev lokal): 18 halaman app | semua 307 ke `/login` (kecuali `/`, `/login`, `/accept-invite`, `/reset-password` = 200) |
| Tanpa login: `/api/notifications/summary`, `/api/cron/*` | 401; `read-all` GET 405 (POST saja) |
| `npm run test:rls` | **tidak dijalankan**: Supabase CLI laptop sedang login akun lain |

Data produksi (baca-saja, 8 Nov 2026): 5 project ACTIVE, 9 task (1 terbuka),
13 user. **1 project tanpa PM aktif** (PM satu-satunya nonaktif). Tidak ada
task terbuka milik user nonaktif, tidak ada task terbuka di project tertutup.

## A. Tinggi: perbaiki dulu

| # | Area | Lokasi | Masalah dan skenario | Usulan | Bukti |
| --- | --- | --- | --- | --- | --- |
| A1 | Task | `components/tasks/TaskForm.tsx:167`, `app/(app)/tasks/[id]/page.tsx:235`, `app/actions/tasks.ts` (`updateTask`) | Form Edit tampil untuk task DONE/CANCELLED; dropdown status hanya status terbuka, `defaultValue='DONE'` tidak ada di opsi sehingga browser memilih TODO. PM membetulkan typo judul task DONE -> task kembali TODO, `completed_at` terhapus, KPI berubah, tanpa peringatan. | Jangan tampilkan form edit untuk task terminal (atau kunci status lama); tombol "Reopen" eksplisit; server menolak update status task terminal tanpa flag reopen. | DIPERBAIKI (cabang fix/audit-a1-a6) |
| A2 | Meeting/RBAC | `lib/meetings/rules.ts:109` (`canManageMeetingFull`) | PM yang hanya **peserta** meeting mana pun mendapat kelola penuh (complete/cancel, ganti organizer, hapus peserta), termasuk meeting project PM lain; `project_id` tidak dicek. | `isProjectPM \|\| (isParticipant && !meeting.project_id)` + kasus di `tests/meetings-rules.check.ts`. | DITERIMA: sesuai desain, akses meeting diatur Admin/setara (pemilik, 8 Nov 2026) |
| A3 | Auth | `app/actions/password.ts:64` (`completePasswordChange`) | Hanya menghapus flag `must_change_password` tanpa memastikan password benar-benar diganti; dipanggil dari komponen client sehingga bisa dipanggil langsung. Password sementara dari admin bisa dipakai terus. | Ganti password dan hapus flag dalam satu action server, atau verifikasi waktu ubah password di Supabase Auth. | TERBUKTI, DITURUNKAN ke Sedang (pemilik, 8 Nov 2026): hanya user itu sendiri yang bisa melewati, lewat DevTools. **DIPERBAIKI 9 Nov 2026**: `setOwnPassword` mengganti password di server lalu menghapus flag; diuji `npm run e2e:a3` |
| A4 | Task/RBAC | `app/(app)/tasks/[id]/page.tsx:57-61`, `lib/data/task-list.ts:77` | PM melihat semua task di `/tasks` tetapi detail 404 bila bukan PM project-nya, **termasuk task yang di-assign ke dirinya**. Link di email/notifikasi TASK_ASSIGNED juga 404. | Aturan baca PM: task project miliknya ATAU task yang ia pegang; samakan filter daftar. | DIPERBAIKI (cabang fix/audit-a1-a6) |
| A5 | User | `lib/supabase/proxy.ts:73-76`, `lib/auth/session.ts:77-79` | User INVITED yang sudah punya sesi: `/dashboard` -> `requireProfile` -> `/login` -> proxy -> `/dashboard` = loop (ERR_TOO_MANY_REDIRECTS). | Arahkan INVITED ke `/accept-invite`, bukan `/login`. | DIPERBAIKI (cabang fix/audit-a1-a6) |
| A6 | User | `components/users/UserForms.tsx:117`, `app/actions/users.ts` (`updateUser`) | Form Edit User menawarkan status INVITED dan server menerimanya; admin bisa men-set **dirinya sendiri** INVITED (Rule 05 hanya cek INACTIVE) -> terkunci + loop A5. Log tercatat `USER_DEACTIVATED`. | Hapus INVITED dari opsi edit; tolak di server; perlakukan self-change selain ACTIVE seperti deactivate. | DIPERBAIKI (cabang fix/audit-a1-a6) |
| A7 | User | `components/users/UserForms.tsx:30-33`, `app/actions/users.ts` (`setUserStatus`) | Tombol "Activate" pada user INVITED membuat ACTIVE tanpa password; link undangan lalu melewati form password -> user tidak bisa login lagi. | Sembunyikan untuk INVITED; ganti "Kirim ulang undangan". | DIPERBAIKI: tombol disembunyikan + ditolak server untuk INVITED |
| A8 | User | `app/actions/users.ts:135-147` | Tidak ada kirim ulang undangan dan tidak ada lupa password mandiri (`resetPasswordForEmail` tidak dipakai). Link undangan kedaluwarsa = harus hapus user di Supabase Dashboard (bisa gagal karena task ter-assign). | Aksi admin "Kirim ulang undangan / link reset" dengan pola `generateLink` yang sudah ada. | DIPERBAIKI sebagian: link undangan ulang / reset password oleh admin; lupa password mandiri belum |
| A9 | Suggestion | `app/actions/suggestions.ts:605` | Saat approve dengan assignee diganti, yang dinotifikasi assignee **usulan**, bukan yang dipilih; tanpa email TASK_ASSIGNED. | Teruskan assignee terpilih; pakai `emitTaskAssigned`. | DIPERBAIKI: TASK_ASSIGNED (in-app + email) ke assignee terpilih |
| A10 | Meeting | `app/actions/meetings.ts:1741`, `:537` | Meeting tanpa project: action item tidak pernah bisa jadi task ("Move it to a project first") padahal project meeting tidak bisa diubah. | Pilih project saat konversi, atau izinkan set project bila masih kosong. | DIPERBAIKI: project dipilih di form Create Task untuk meeting tanpa project |
| A11 | Form | `components/meetings/detail/MeetingForms.tsx:175` | Organizer lama nonaktif/null tidak ada di opsi -> browser memilih user pertama -> setiap simpan diam-diam mengganti organizer. | Tampilkan organizer lama "(nonaktif)" atau opsi "tidak berubah". | DIPERBAIKI: opsi organizer lama (nonaktif/kosong) jadi default |
| A12 | Form/Project | `components/projects/workspace/SettingsTab.tsx:11` | PM nonaktif/turun role hilang diam-diam dari project saat Settings disimpan; PM bisa menghapus dirinya sendiri lalu kehilangan akses. Data produksi: 1 project kini tanpa PM aktif. | Tampilkan PM lama bertanda + peringatan; tolak PM menghapus dirinya sendiri. | DIPERBAIKI: peringatan PM lama yang akan dilepas; PM tidak bisa melepas dirinya sendiri. Data 1 project tanpa PM aktif tetap perlu diatur Admin |
| A13 | Form | semua form `useActionState` + `defaultValue` (React 19) | Setelah action selesai (termasuk saat mengembalikan error) form di-reset: isian create kosong lagi, edit kembali ke nilai awal. | Kembalikan nilai terkirim di state, atau `preventDefault` + `startTransition(formAction)`. | DIPERBAIKI: hook `useFormAction` di 41 form (reset hanya bila sukses); perilaku reset React 19 sesuai dokumentasi, belum dicoba di browser |

## B. Sedang

| # | Area | Lokasi | Masalah | Usulan | Bukti |
| --- | --- | --- | --- | --- | --- |
| B1 | Project/RBAC | `components/projects/workspace/TasksTab.tsx:35-41,163` | TEAM/VIEWER/PM non-owner melihat semua task project (judul, assignee); link detail 404. | Filter per role seperti `/tasks`, atau tanpa link. | DIPERBAIKI: TEAM_MEMBER hanya task miliknya; PM project lain tanpa link kecuali task miliknya |
| B2 | Project/RBAC | `app/(app)/projects/[id]/page.tsx:116-128,220` | PM non-owner melihat semua suggestion project + tombol "+ Suggest Task" yang pasti ditolak; link 404. | Tampilkan hanya untuk pemilik project / filter `suggested_by`. | DIPERBAIKI: selain Admin/PM project hanya suggestion miliknya; tombol Suggest ikut canSuggestForProject |
| B3 | RBAC | `components/projects/workspace/ActivityMembersTabs.tsx:12`, `app/(app)/tasks/[id]/page.tsx:118` | Tab Activity project/timeline task memakai admin client tanpa scope; log yang ditutup RLS di `/activity` tetap terbaca. | Pakai user client (RLS) seperti `/activity`. | DIPERBAIKI (AFK) |
| B4 | Meeting | `components/meetings/detail/WorkspaceForms.tsx:424`, `lib/meetings/rules.ts:124` | Tombol "Create Task" di action item tampil lalu pasti gagal untuk meeting tanpa project / PM bukan pemilik. | Ikutkan syarat project + PM di `canCreateTaskFromMeeting`. | DIPERBAIKI (AFK) |
| B5 | Meeting | `app/actions/meetings.ts:860,1269,1712` | Meeting CANCELLED: notes dikunci, tetapi agenda/keputusan/action item dan konversi task tetap jalan; editor notes tampil lalu error. | Kunci konsisten untuk meeting CANCELLED. | DIPERBAIKI (AFK) |
| B6 | Meeting | `app/actions/meetings.ts:478,648`, `lib/meetings/scheduler.ts:99` | Undangan email dikirim saat DRAFT; `scheduleMeeting` tidak menotifikasi; reminder hanya untuk SCHEDULED; DRAFT tidak bisa langsung complete. | Kirim undangan saat schedule; jelaskan alur DRAFT. | DIPERBAIKI (AFK) [keputusan default] |
| B7 | Meeting | `app/actions/meetings.ts:1418,1727` | Action item yang task-nya dihapus terkunci ("Task already exists" padahal 404). | Abaikan task `is_deleted`. | DIPERBAIKI (AFK) |
| B8 | Suggestion | `components/suggestions/SuggestionForms.tsx:367`, `app/actions/suggestions.ts:463` | Review note diabaikan saat approve; deadline kosong jadi hari ini; reviewer tidak bisa set deadline/prioritas. | Simpan note; field deadline/prioritas di ReviewForm. | DIPERBAIKI (AFK) [keputusan default] |
| B9 | Suggestion | `app/actions/suggestions.ts:290-321` | Resubmit tidak menotifikasi PM dan tidak memvalidasi priority/tanggal seperti create. | Notifikasi + validasi sama. | DIPERBAIKI (AFK) |
| B10 | Suggestion | `app/actions/suggestions.ts:453-464` | Task hasil suggestion tidak mengisi `source_type/source_id` (blok "Source" tidak tampil). | Isi source seperti task dari meeting. | DIPERBAIKI (AFK) |
| B11 | Meeting | `components/meetings/detail/WorkspaceForms.tsx:287` | Create Task dari action item tanpa field assignee/deadline; deadline kosong = hari ini. | Tambah field assignee + deadline wajib. | DIPERBAIKI (AFK) |
| B12 | Form | semua action | Batas panjang hanya `maxLength` di UI (sebagian textarea tanpa batas); server tidak membatasi (kecuali evidence 2000, nama 120). | Helper `readField(fd, name, max)` sama di UI & server. | DIPERBAIKI (AFK) |
| B13 | User | `app/actions/users.ts:594` | Menonaktifkan user tidak memperingatkan task terbuka / jabatan PM; cron tetap menotifikasi; PM nonaktif tetap dapat notifikasi PM. | Tampilkan jumlah task & PM-ship + opsi reassign. | DIPERBAIKI (AFK) [keputusan default] |
| B14 | Project | `app/actions/tasks.ts:146`, `app/api/cron/deadlines/route.ts:51` | Status project CANCELLED/COMPLETED hanya label: task baru tetap bisa dibuat, reminder overdue tetap dikirim. | Blok create + reminder untuk project tertutup. | DIPERBAIKI (AFK) [keputusan default] |
| B15 | Notifikasi | `lib/notifications/service.ts:113` | Satu email ke banyak penerima lewat `to`: semua penerima saling melihat alamat email. | Kirim per penerima. | DIPERBAIKI (AFK), kirim nyata belum diuji |
| B16 | Notifikasi | `lib/notifications/service.ts:62-88` | Event diklaim sebelum notifikasi ditulis; bila insert gagal, event hilang permanen. | Klaim + tulis dalam satu transaksi / lepas klaim bila gagal. | DIPERBAIKI (AFK) |
| B17 | Activity | `app/(app)/activity/page.tsx:88-95` | Filter actor diterapkan setelah paginasi: hasil bisa kosong di halaman 1 padahal ada di halaman 3. | Filter di query. | DIPERBAIKI (AFK) |
| B18 | Form | `components/auth/ChangePasswordForm.tsx:56-60` | Bila hapus flag gagal, error hanya ke console lalu redirect -> bisa kembali ke `/change-password` tanpa penjelasan. | Tampilkan error, jangan redirect. | DIPERBAIKI (AFK) |
| B19 | User | `app/actions/users.ts:299-323,192,263` | `USER_CREATED` tercatat dua kali (label salah `fallback-link`); pesan "User created…" padahal createUser bisa gagal. | Rapikan log + pesan. | DIPERBAIKI (AFK) |

## C. Rendah

| # | Lokasi | Masalah | Usulan |
| --- | --- | --- | --- |
| C1 | `app/actions/tasks.ts:26` (+ `projects.ts`, `suggestions.ts`) | `validDate` memakai `Date.parse`: "2026-02-30" dan "abc 2026" lolos (TERBUKTI), lalu DB menolak dengan pesan generik. | Regex `YYYY-MM-DD` + cek round-trip seperti `meetings.ts`. |
| C2 | `app/(app)/projects/[id]/page.tsx:195` | "+ New Meeting" di project hanya untuk pemilik, padahal server mengizinkan TEAM terlibat. | Pakai hasil `assertCanCreateInProject`. |
| C3 | `app/(app)/tasks/[id]/page.tsx:86` | Dropdown Project di Edit Task menampilkan semua project untuk PM (pindah ke project lain ditolak). | Batasi ke project PM. |
| C4 | `components/meetings/detail/WorkspaceForms.tsx:556` | "Remove" pada organizer tampil, pasti ditolak. | Sembunyikan. |
| C5 | `app/(app)/users/[id]/page.tsx:93` | "Deactivate" di akun sendiri tampil, pasti ditolak. | Sembunyikan. |
| C6 | `components/dashboard/Sections.tsx:109` | KPI "PENDING SUGGESTIONS" selalu 0 (hardcode). | Hitung PENDING atau hapus. |
| C7 | `app/(app)/activity/page.tsx:17` | Filter Entity tanpa opsi `meeting`. | Tambah opsi. |
| C8 | `app/(app)/tasks/page.tsx:40` | "+ Add Task" untuk PM tanpa project -> dropdown project kosong. | Sembunyikan bila tak punya project. |
| C9 | `app/actions/meetings.ts:579` | `add_to_calendar` tidak ada di form; setiap edit menimpanya jadi false. | Checkbox atau jangan di-update. |
| C10 | `components/meetings/detail/WorkspaceForms.tsx:469` | Peserta eksternal didukung server tapi tidak ada field-nya; pesan error menyebut "external participant". | Tambah field atau ubah pesan. |
| C11 | assignee select (`TaskForm`, action item) | Assignee lama nonaktif tidak ada di opsi: action item kehilangan assignee diam-diam; task tidak bisa disimpan tanpa penjelasan. | Tampilkan "(nonaktif)". |
| C12 | hapus agenda/keputusan/action item/peserta, Reject suggestion | Tanpa konfirmasi (task sudah pakai `confirm`). | Tambah `confirm`. |
| C13 | `ChangePasswordForm.tsx:46`, `reset-password/page.tsx:164` | Pesan mentah Supabase ditampilkan. | Petakan ke pesan ramah. |
| C14 | `lib/utils/dates.ts:28-38`, `activity/page.tsx:82` | Overdue dan filter tanggal memakai UTC (selisih 7 jam dari WIB); digest sudah WIB. | Satu helper tanggal WIB. |
| C15 | `app/actions/tasks.ts:58` | Admin bisa mengedit task yang sudah dihapus lewat POST; delete tanpa notifikasi/restore. | Cek `is_deleted`. |
| C16 | `lib/meetings/scheduler.ts:139` | Reminder notes hanya untuk meeting kemarin. | Cari semua meeting lampau tanpa notes. |
| C17 | `app/api/cron/deadlines/route.ts:57,115` | Overdue hanya ke assignee (PM tidak); batas 1000 task tanpa paginasi. | Opsional. |
| C18 | `app/actions/suggestions.ts`, `meetings.ts` (export helper tanpa `requireProfile`) | Helper server menerima `role`/`userId` dari parameter; aman selama hanya dipanggil server component. | Pindah ke `lib/data` (`server-only`). |
| C19 | `NotificationComponents.tsx:42,61` | Mark read tanpa status pending. | Opsional. |
| C20 | Kebijakan | TEAM_MEMBER boleh membatalkan task miliknya sendiri (lalu terkunci). | Keputusan pemilik: tetap atau hanya PM. |

## D. Bahasa UI

Label, tombol, judul, dan pesan server: **Inggris**. Placeholder, teks bantuan,
halaman login, dan isi email: **Indonesia**; subjek email Inggris; beberapa
form mencampur di satu tempat ("— Pilih —" di samping "— None —", "Review Note
(wajib untuk revise/reject)"). Usul: pilih satu bahasa (Indonesia untuk
pengguna internal) dan kumpulkan teks di satu modul. Butuh keputusan pemilik.

## E. Yang sudah benar

- Semua halaman sensitif dijaga server (`requireAdmin`, `requireManager`,
  `can()`, cek PM project); menu sidebar cocok dengan guard.
- Aksi project/workstream/task memakai `canManageProjectFor`; ubah status,
  submit, cancel, evidence memakai `canActOnTask`; aksi users semua
  `requireAdmin` + Rule 05/06.
- Review/resubmit suggestion, tab Settings project, notifikasi (filter
  `user_id` sesi), `/activity` (RLS) sesuai izin.
- Form menonaktifkan tombol saat pending; input di-trim; enum divalidasi
  dan cocok dengan CHECK DB; deadline >= start sama di server dan DB; link
  evidence/meeting wajib http(s); isi email di-escape.
- Konversi suggestion/action item idempoten; ganti PM dalam satu transaksi;
  hapus workstream ditolak bila masih ada task aktif.

## F. Uji manual yang disarankan (setelah perbaikan A)

1. Task DONE: buka Edit, ubah judul, simpan -> status tetap DONE (A1).
2. PM X peserta meeting project PM Y -> tidak bisa complete/cancel/hapus peserta (A2).
3. User dengan password sementara: tidak bisa masuk tanpa benar-benar mengganti password (A3).
4. PM di-assign task project lain -> detail task terbuka, tidak 404 (A4).
5. User INVITED membuka `/dashboard` -> diarahkan ke `/accept-invite`, tanpa loop (A5).
6. Edit User: tidak ada opsi INVITED; admin tidak bisa mengubah status sendiri (A6).
7. Form create task dengan deadline < start -> pesan error, isian tidak hilang (A13).
8. Settings project dengan PM nonaktif -> PM lama tampil bertanda, tidak hilang diam-diam (A12).

## H. Hasil kerja AFK (8 Nov 2026 malam)

Cabang `afk/audit-b-c` (belum di-merge/push, sesuai permintaan pemilik:
commit saja). Satu commit per temuan supaya bisa di-revert satu-satu.

**Status kelompok C**

| # | Status |
| --- | --- |
| C1–C13, C15, C16, C18 | DIPERBAIKI |
| C14 | DIPERBAIKI (9 Nov 2026, keputusan pemilik): overdue, filter "minggu ini", Gantt, dan badge historis kini memakai tanggal WIB (`todayISO()` memanggil `todayInAppTime()`). Filter tanggal Activity sudah WIB sebelumnya. |
| C17 | DILEWATI (opsional; overdue ke PM menambah pemakaian jatah email) |
| C19 | DILEWATI (opsional) |
| C20 | DIPERBAIKI (9 Nov 2026, keputusan pemilik): Cancel task hanya ADMIN atau PM pengelola project (`canCancelTask`); tombol disembunyikan dan server menolak untuk role lain. |
| Lanjutan B1 | `/tasks` untuk PM: hanya task project miliknya + task yang di-assign kepadanya [keputusan default] |

**Keputusan default yang perlu dikonfirmasi pemilik** (commit bertanda
`[keputusan default]`):

- B6: undangan meeting dikirim saat **Schedule**, bukan saat DRAFT dibuat;
  edit/peserta baru/batal pada DRAFT tidak dinotifikasi.
- B8: approve suggestion wajib deadline; reviewer bisa ubah prioritas/deadline.
- B13: menonaktifkan user tidak diblokir; admin diberi peringatan jumlah task
  terbuka + project tempat ia PM. Notifikasi hanya ke user ACTIVE.
- B14: project COMPLETED/CANCELLED menolak task/suggestion baru dan tidak lagi
  mengirim reminder deadline.
- Lanjutan B1: PM tidak lagi melihat task project PM lain di `/tasks`.

**Verifikasi**

- Gerbang lokal di commit akhir: `tsc` 0, `eslint` 0, `test:logic` lulus
  (tes baru: `test:limits`, aturan meeting B4/B5, pesan password C13),
  `next build` 0, `check:secrets` bersih.
- 2 subagen pereview (B dan C); temuannya sudah diperbaiki di commit
  "tindak lanjut review".
- Smoke test browser (headless, build cabang ini via `next start` lokal,
  database produksi, sesi admin dari link recovery sekali pakai; password
  tidak diubah): 24 halaman (dashboard, tasks, projects + 7 tab, meetings,
  suggestions, activity, users, notifications, profile, form create) status
  200 tanpa halaman error. **A13 terbukti**: Create Task dengan deadline <
  start date menampilkan "Deadline must be after start date." dan judul,
  deskripsi, deadline tetap terisi. Dicek: tidak ada task uji tersimpan.

**Temuan baru**

- React error #418 (hydration mismatch) di `/tasks` dan `/tasks?view=overdue`. **DIPERBAIKI** (cabang `fix/hydration-418`): penyebabnya form pencarian bersarang di dalam form filter.
  Juga terjadi di produksi (`main`), jadi bukan dari cabang ini. Penyebab
  belum dicari (butuh dev server; RAM laptop tidak cukup saat itu).

**Belum dikerjakan**

- Keseragaman bahasa UI (menunggu keputusan bahasa).
- Uji klik alur yang menulis data (approve, schedule, kirim email nyata B15).
- 1 project tanpa PM aktif (data produksi, perlu Admin).

## G. Cara audit dan batasan

- 3 subagen review baca-saja (tombol & RBAC, alur, form), lalu temuan
  teratas dibaca ulang langsung di kode (label TERBUKTI).
- Tidak menekan tombol di produksi; tidak menguji tampilan browser.
- Tidak dicek: form filter GET (TaskFilterForm, MeetingFilterForm, Topbar),
  isi rinci `lib/data/dashboard.ts`, policy RLS selain yang disebut, perilaku
  React 19 reset form di browser (A13).

## I. Kerja AFK lanjutan (9 Nov 2026)

Lima fase di cabang bertumpuk `afk2/fase1-uji` sampai `afk2/fase5-dokumen` (belum di-merge dan belum di-push; hanya commit). Daftar commit: `git log --oneline ebd02ca..HEAD`. Basis data dan hasil rinci ada di laporan masing-masing.

| Fase | Isi | Hasil | Laporan |
| --- | --- | --- | --- |
| 1. Uji | skrip e2e masuk repo (`e2e:smoke`, `e2e:write`, `e2e:cleanup`, `e2e:rbac`, `e2e:a3`); matriks RBAC end-to-end; aturan status user jadi fungsi murni + tes | 145 kombinasi halaman x role, 1 ketidaksesuaian (tombol "+ Buat Meeting" tampil untuk VIEWER, kosmetik; link kosong di empty state sudah dibenahi); **A3 DIPERBAIKI** | `rbac-matrix-hasil.md` |
| 2. Review keamanan | review semua titik `createAdminClient()` (sekitar 150); review kebijakan RLS terhadap aturan aplikasi; konsistensi data produksi (baca saja) | tidak ada celah tulis; satu kebocoran baca ditutup (workstream semua project dikirim ke browser di form Suggestion); RLS tabel `tasks`, `projects`, `workstreams`, `project_managers` terbaca semua user ACTIVE; data: 1 project tanpa PM aktif, 35 notifikasi lama belum dibaca | `review-admin-client.md`, `review-rls.md`, `laporan-data-2026-11-09.md` |
| 3. Kualitas | aksesibilitas (axe-core), tata letak mobile 375 px, template email | pelanggaran axe 414 menjadi 2 (sisa: warna brand `deep-gold` di atas putih); halaman overflow mobile 3 menjadi 0; 18 template email ter-escape, subject berbahasa Indonesia, kalimat penutup ganda dibuang; sisa teks UI Inggris diterjemahkan | `a11y-hasil.md`, `mobile-hasil.md`, `email-hasil.md` |
| 4. Performa | autentikasi per request tanpa round trip kedua (`getClaims`), N+1 scheduler meeting dibatch, `loading.tsx`, helper form dipusatkan, dependensi diperbarui | median TTFB 448 menjadi 346 ms, waktu muat 681 menjadi 580 ms | `performa-hasil.md` |
| 5. Dokumen | `panduan-pengguna.md`, README ditulis ulang, bagian ini | - | - |

Perbaikan hasil review ikut dicatat sebagai commit terpisah (mis. password baru tidak boleh sama dengan sementara, pesan flag gagal, e2e membersihkan diri).

**Status temuan lama yang berubah**

| # | Status |
| --- | --- |
| A3 | **DIPERBAIKI**: `setOwnPassword` mengganti password dan membersihkan flag `must_change_password` di server; diuji `npm run e2e:a3`. |
| B15 | tetap: kode memisah penerima per email, **kirim nyata belum diuji** (menunggu keputusan penerima uji, lihat di bawah). |

### Keputusan pemilik yang masih terbuka

1. **C14, Overdue UTC atau WIB.** Overdue task dihitung dengan tanggal UTC (`lib/utils/dates.ts`), sehingga Task berdeadline 10 Nov menjadi Overdue 11 Nov pukul 07.00 WIB. Digest dan meeting sudah WIB. Pilih: tetap (sudah tercantum di panduan pengguna) atau satu helper tanggal WIB.
2. **C20, Team Member membatalkan task sendiri.** Sekarang boleh (lalu task terkunci). Pilih: tetap atau hanya PM/Admin.
3. **Lupa password mandiri.** Belum ada; pengguna meminta Admin membuat "Link reset Password". Pilih: tambah tombol di halaman Login (butuh email Supabase/Brevo yang andal) atau tetap lewat Admin.
4. **B15, penerima uji kirim email nyata.** Perlu alamat penerima uji yang boleh dipakai untuk memastikan email per penerima terkirim.
5. **PM untuk project `001`.** Satu-satunya PM-nya berstatus INACTIVE; project ACTIVE dengan 4 task aktif. Tambah PM di tab Pengaturan project, atau ubah status project.
6. **Pengetatan RLS.** Usulan SQL ada di `review-rls.md` (policy scoped untuk `tasks`, `projects`, `workstreams`; cabut EXECUTE fungsi `SECURITY DEFINER`; cabut grant berlebih). Aplikasi tidak membaca tabel itu lewat client user, jadi perilaku seharusnya tidak berubah. Uji dulu dalam transaksi yang di-rollback, lalu `npm run test:rls` dan `npm run e2e:rbac`.
7. **Dua catatan cakupan RBAC** (`rbac-matrix-hasil.md`): (a) VIEWER dan PM lain bisa membuka halaman Project orang lain (nama, workstream, anggota); (b) VIEWER melihat seluruh daftar task dan detail task siapa pun. Pilih: dibiarkan atau dibatasi di `projects/[id]` dan `tasks/[id]`.
8. **Login ulang Supabase CLI.** Timer cadangan hari Senin gagal selama CLI masuk ke akun Supabase lain. Pemilik perlu login ulang ke akun yang memiliki project ini (`docs/backup.md`).

### Keputusan pemilik (9 Nov 2026)

| # | Keputusan | Status |
| --- | --- | --- |
| 1. C14 | Overdue memakai WIB | Dikerjakan: `lib/utils/dates.ts` (`todayISO`, `daysFromTodayISO`, tanggal submit/batal dalam WIB), `lib/data/task-list.ts`, dashboard, Gantt, tab Overview; tes `npm run test:task` |
| 2. C20 | Cancel hanya PM/Admin | Dikerjakan: `lib/auth/task-access.ts` `canCancelTask`, `cancelTask`, halaman detail task; tes `npm run test:task-access`, `e2e:rbac` |
| 3. Lupa password | Tetap lewat Admin | Tidak ada perubahan |
| 4. B15 | Ditunda | Kirim nyata belum diuji |
| 5. Project `001` | Disiapkan untuk pemilik | Dicek 9 Nov 2026: 4 task, 3 DONE dan 1 CANCELLED, tidak ada task aktif; PM satu-satunya INACTIVE. Pilihan: tambah PM aktif di tab Pengaturan, atau ubah status project ke COMPLETED |
| 6. RLS | Disiapkan sebagai migrasi, belum dijalankan | `database/migrations/016_rls_scoped_reads.sql` + `down/016_rls_scoped_reads.down.sql`; `rls.check.sql` ditambah 8 cek (total 34) |
| 7. Cakupan baca RBAC | Dibiarkan terbuka | VIEWER dan PM tetap bisa membuka project lain; migrasi 016 mengikuti keputusan ini |
| 8. Supabase CLI | Menunggu pemilik login ulang | - |

**Cara menerapkan migrasi 016** (setelah Supabase CLI login ulang):

1. Jalankan isi `016_rls_scoped_reads.sql` di SQL Editor Supabase.
2. `npm run test:rls` harus menunjukkan 34 cek lulus. Sebelum 016 diterapkan, 8 cek baru memang gagal.
3. `npm run e2e:rbac` (server lokal, email mati) harus 0 ketidaksesuaian.
4. Bila ada yang gagal, jalankan `down/016_rls_scoped_reads.down.sql`.

### Temuan baru

**DARURAT (9 Nov 2026): Task baru gagal dibuat.** Default kode `'T-' || lpad(nextval('task_code_seq')::text, 2, '0')` memotong angka 3 digit (`lpad('123', 2, '0') = '12'`). Setelah urutan melewati 99 (task uji dibuat lalu dihapus), nomor 100–159 menjadi T-10 sampai T-15 yang sudah dipakai, sehingga hampir setiap insert gagal `duplicate key ... tasks_code_unique`. Dibuktikan 9 Nov dengan 3 insert service role berturut-turut (semua gagal). Perbaikan: `database/migrations/017_code_no_truncate.sql` (fungsi `next_code` tanpa pemotongan untuk Task, Suggestion, Meeting, Project; `task_code_seq` kembali ke nomor Task terbesar). Pemilik menjalankannya di SQL Editor; tidak bergantung pada 016.

**Urutan kode `meeting_code_seq` tertinggal dari data.** Saat e2e, satu putaran gagal dengan `duplicate key ... meetings_code_unique`. Kode Meeting tertinggi di produksi adalah `M-012`, tetapi `meeting_code_seq` masih di bawahnya. Percobaan yang gagal itu memakai satu nilai, sehingga urutan kini melewati `M-012`. Sebab tertinggalnya urutan belum diketahui [INFERENCE: data Meeting pernah dimasukkan atau diubah tanpa lewat default kolom]. Dampaknya bila terulang: membuat Meeting baru bisa gagal dengan "Tidak dapat membuat Meeting. Silakan coba lagi." sampai urutan melewati kode terbesar.

Rekomendasi: pemilik menjalankan lewat SQL editor Supabase (belum dijalankan oleh siapa pun; pemeriksaan bisa dijalankan lebih dulu).

Pemeriksaan (hanya membaca): `last_value` urutan harus >= angka kode tertinggi.

```sql
select 'meeting'    as urutan, (select last_value from public.meeting_code_seq)    as last_value, (select max(substring(code from 3)::int) from public.meetings)         as kode_tertinggi
union all
select 'task',       (select last_value from public.task_code_seq),       (select max(substring(code from 3)::int) from public.tasks)
union all
select 'suggestion', (select last_value from public.suggestion_code_seq), (select max(substring(code from 3)::int) from public.task_suggestions)
union all
select 'project',    (select last_value from public.project_code_seq),    (select max(code::int) from public.projects);
```

Perbaikan untuk Meeting (pernyataan yang direkomendasikan):

```sql
select setval('public.meeting_code_seq', (select max(substring(code from 3)::int) from public.meetings));
```

Padanan untuk urutan kode lain, dijalankan hanya bila pemeriksaan menunjukkan `last_value` lebih kecil dari `kode_tertinggi`:

```sql
select setval('public.task_code_seq',       (select max(substring(code from 3)::int) from public.tasks));
select setval('public.suggestion_code_seq', (select max(substring(code from 3)::int) from public.task_suggestions));
select setval('public.project_code_seq',    (select max(code::int) from public.projects));
```

Catatan: `setval` menurunkan urutan bila angka yang diberikan lebih kecil dari `last_value` saat ini, jadi jalankan hanya bila pemeriksaan menunjukkan urutan tertinggal. Tabel yang masih kosong membuat `max` bernilai NULL dan `setval` gagal; lewati urutan itu. Kode Workstream (A, B, C, ...) dibuat trigger per project, bukan urutan, sehingga tidak ikut diperiksa. Nama urutan diambil dari `database/migrations/005`, `006`, dan `008`.
