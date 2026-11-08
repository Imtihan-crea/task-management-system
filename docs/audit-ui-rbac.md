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
| A3 | Auth | `app/actions/password.ts:64` (`completePasswordChange`) | Hanya menghapus flag `must_change_password` tanpa memastikan password benar-benar diganti; dipanggil dari komponen client sehingga bisa dipanggil langsung. Password sementara dari admin bisa dipakai terus. | Ganti password dan hapus flag dalam satu action server, atau verifikasi waktu ubah password di Supabase Auth. | TERBUKTI, DITURUNKAN ke Sedang (pemilik, 8 Nov 2026): hanya user itu sendiri yang bisa melewati, lewat DevTools |
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
| B1 | Project/RBAC | `components/projects/workspace/TasksTab.tsx:35-41,163` | TEAM/VIEWER/PM non-owner melihat semua task project (judul, assignee); link detail 404. | Filter per role seperti `/tasks`, atau tanpa link. | AUDIT |
| B2 | Project/RBAC | `app/(app)/projects/[id]/page.tsx:116-128,220` | PM non-owner melihat semua suggestion project + tombol "+ Suggest Task" yang pasti ditolak; link 404. | Tampilkan hanya untuk pemilik project / filter `suggested_by`. | AUDIT |
| B3 | RBAC | `components/projects/workspace/ActivityMembersTabs.tsx:12`, `app/(app)/tasks/[id]/page.tsx:118` | Tab Activity project/timeline task memakai admin client tanpa scope; log yang ditutup RLS di `/activity` tetap terbaca. | Pakai user client (RLS) seperti `/activity`. | AUDIT |
| B4 | Meeting | `components/meetings/detail/WorkspaceForms.tsx:424`, `lib/meetings/rules.ts:124` | Tombol "Create Task" di action item tampil lalu pasti gagal untuk meeting tanpa project / PM bukan pemilik. | Ikutkan syarat project + PM di `canCreateTaskFromMeeting`. | AUDIT |
| B5 | Meeting | `app/actions/meetings.ts:860,1269,1712` | Meeting CANCELLED: notes dikunci, tetapi agenda/keputusan/action item dan konversi task tetap jalan; editor notes tampil lalu error. | Kunci konsisten untuk meeting CANCELLED. | AUDIT |
| B6 | Meeting | `app/actions/meetings.ts:478,648`, `lib/meetings/scheduler.ts:99` | Undangan email dikirim saat DRAFT; `scheduleMeeting` tidak menotifikasi; reminder hanya untuk SCHEDULED; DRAFT tidak bisa langsung complete. | Kirim undangan saat schedule; jelaskan alur DRAFT. | AUDIT |
| B7 | Meeting | `app/actions/meetings.ts:1418,1727` | Action item yang task-nya dihapus terkunci ("Task already exists" padahal 404). | Abaikan task `is_deleted`. | AUDIT |
| B8 | Suggestion | `components/suggestions/SuggestionForms.tsx:367`, `app/actions/suggestions.ts:463` | Review note diabaikan saat approve; deadline kosong jadi hari ini; reviewer tidak bisa set deadline/prioritas. | Simpan note; field deadline/prioritas di ReviewForm. | AUDIT |
| B9 | Suggestion | `app/actions/suggestions.ts:290-321` | Resubmit tidak menotifikasi PM dan tidak memvalidasi priority/tanggal seperti create. | Notifikasi + validasi sama. | AUDIT |
| B10 | Suggestion | `app/actions/suggestions.ts:453-464` | Task hasil suggestion tidak mengisi `source_type/source_id` (blok "Source" tidak tampil). | Isi source seperti task dari meeting. | AUDIT |
| B11 | Meeting | `components/meetings/detail/WorkspaceForms.tsx:287` | Create Task dari action item tanpa field assignee/deadline; deadline kosong = hari ini. | Tambah field assignee + deadline wajib. | AUDIT |
| B12 | Form | semua action | Batas panjang hanya `maxLength` di UI (sebagian textarea tanpa batas); server tidak membatasi (kecuali evidence 2000, nama 120). | Helper `readField(fd, name, max)` sama di UI & server. | AUDIT |
| B13 | User | `app/actions/users.ts:594` | Menonaktifkan user tidak memperingatkan task terbuka / jabatan PM; cron tetap menotifikasi; PM nonaktif tetap dapat notifikasi PM. | Tampilkan jumlah task & PM-ship + opsi reassign. | AUDIT |
| B14 | Project | `app/actions/tasks.ts:146`, `app/api/cron/deadlines/route.ts:51` | Status project CANCELLED/COMPLETED hanya label: task baru tetap bisa dibuat, reminder overdue tetap dikirim. | Blok create + reminder untuk project tertutup. | AUDIT |
| B15 | Notifikasi | `lib/notifications/service.ts:113` | Satu email ke banyak penerima lewat `to`: semua penerima saling melihat alamat email. | Kirim per penerima. | AUDIT |
| B16 | Notifikasi | `lib/notifications/service.ts:62-88` | Event diklaim sebelum notifikasi ditulis; bila insert gagal, event hilang permanen. | Klaim + tulis dalam satu transaksi / lepas klaim bila gagal. | AUDIT |
| B17 | Activity | `app/(app)/activity/page.tsx:88-95` | Filter actor diterapkan setelah paginasi: hasil bisa kosong di halaman 1 padahal ada di halaman 3. | Filter di query. | AUDIT |
| B18 | Form | `components/auth/ChangePasswordForm.tsx:56-60` | Bila hapus flag gagal, error hanya ke console lalu redirect -> bisa kembali ke `/change-password` tanpa penjelasan. | Tampilkan error, jangan redirect. | AUDIT |
| B19 | User | `app/actions/users.ts:299-323,192,263` | `USER_CREATED` tercatat dua kali (label salah `fallback-link`); pesan "User created…" padahal createUser bisa gagal. | Rapikan log + pesan. | AUDIT |

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

## G. Cara audit dan batasan

- 3 subagen review baca-saja (tombol & RBAC, alur, form), lalu temuan
  teratas dibaca ulang langsung di kode (label TERBUKTI).
- Tidak menekan tombol di produksi; tidak menguji tampilan browser.
- Tidak dicek: form filter GET (TaskFilterForm, MeetingFilterForm, Topbar),
  isi rinci `lib/data/dashboard.ts`, policy RLS selain yang disebut, perilaku
  React 19 reset form di browser (A13).
