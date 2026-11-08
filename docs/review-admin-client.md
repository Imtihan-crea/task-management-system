# Review pemakaian `createAdminClient()` (9 Nov 2026)

Cakupan: semua pemanggil di `app/`, `lib/`, `components/` (sekitar 150 titik di 52 berkas). Service role melewati RLS, jadi tiap titik harus punya otorisasi di server **sebelum** query. Review dilakukan dengan membaca kode; tidak ada perubahan database.

Ringkasan: tidak ada celah tulis. Satu kebocoran baca kecil ditemukan dan diperbaiki (workstream project lain dikirim ke browser). Dua catatan risiko rendah dibiarkan (butuh keputusan pemilik). Tidak ada titik yang dipindah ke client RLS: hampir semuanya butuh data lintas user (nama, assignee, PM) yang tidak boleh dibaca RLS user biasa, atau menulis ke tabel yang RLS-nya memang tidak mengizinkan tulis.

Keterangan guard: `requireProfile` = user login; `requireManager` = ADMIN/PM; `requireAdmin` = ADMIN; `canManageProjectFor` = ADMIN atau PM project itu; `getMeetingAccess` + `canManageMeeting*` = aturan meeting (`lib/meetings/rules.ts`); `canActOnTask` = assignee atau ADMIN/PM project.

## Server action (tulis)

| Titik | Guard | Verdict |
|---|---|---|
| `actions/invite.ts` `completeInvite` | session user; hanya mengubah profil sendiri INVITED -> ACTIVE | OK |
| `actions/password.ts` `resolveActor`, `setOwnPassword` | cookie session atau access token yang diverifikasi ke Supabase; hanya akun sendiri, status ACTIVE | OK (A3 diperbaiki di commit sebelumnya) |
| `actions/notifications.ts` (baca/tandai/preferensi) | `requireProfile` + filter `user_id = profile.id` | OK |
| `app/api/notifications/read-all` | `auth.getUser()` + filter `user_id` | OK |
| `app/api/cron/deadlines` | `CRON_SECRET` timing-safe (`isCronAuthorized`), 500 bila secret kosong | OK |
| `actions/projects.ts` create/update | `requireManager`; update juga `canManageProjectFor`; PM tidak bisa melepas dirinya; PM baru wajib aktif Admin/PM | OK |
| `actions/workstreams.ts` create/update/delete | `requireManager` + `canManageProjectFor` pada project asli workstream (dimuat dari DB, bukan dari form) | OK |
| `actions/users.ts` (invite, buat user, update, status, access link) | `requireAdmin`; ada cek admin terakhir | OK |
| `actions/tasks.ts` create/update/delete | `requireManager` + `canManageProjectFor`; pindah project dicek di kedua sisi; assignee dan workstream divalidasi | OK |
| `actions/tasks.ts` status/submit/cancel/evidence | `requireProfile` + task dimuat dari DB + `canActOnTask` | OK |
| `actions/suggestions.ts` create | `suggestions.create` + `canSuggestForProject` (PM milik, member punya task) | OK |
| `actions/suggestions.ts` resubmit | hanya `suggested_by` sendiri, status REVISION_REQUESTED | OK |
| `actions/suggestions.ts` review/approve | `canManageProjectFor` pada project usulan | OK |
| `actions/meetings.ts` create | `meetings.create` + `assertCanCreateInProject` | OK |
| `actions/meetings.ts` update/schedule/complete/cancel/peserta | `getMeetingAccess` + `canManageMeetingFull` | OK |
| `actions/meetings.ts` notes/agenda/decision/action item | `canManageMeetingContent`; semua UPDATE/DELETE anak memakai `.eq('meeting_id', meetingId)` sehingga ID dari meeting lain tidak bisa disusupkan (tidak ada IDOR) | OK |
| `actions/meetings.ts` `updateAttendance` | akses meeting + (baris sendiri atau `canManageMeetingFull`) | OK |
| `actions/meetings.ts` `createTaskFromActionItem` | `canCreateTaskFromMeeting`; item dicek milik meeting; PM hanya project miliknya; project tertutup ditolak | OK |

## Halaman dan komponen (baca)

| Titik | Guard | Verdict |
|---|---|---|
| `users/page`, `users/[id]/page` | `requireAdmin` | OK |
| `notifications`, `settings`, `NotificationBell` | `requireProfile` + filter `user_id` sendiri | OK |
| `tasks/new`, `workstreams/new` | `requireManager` (workstream baru juga cek project) | OK |
| `meetings/[id]` + `MeetingWorkspace` (action item, activity) | `getMeetingAccess` + `canViewMeeting` sebelum komponen anak dirender | OK |
| `meetings/new` | `meetings.create` + `assertCanCreateInProject` | OK |
| `tasks/page` + `lib/data/task-list.fetchTaskRows` | scope per role (member: assignee sendiri; PM: project miliknya + yang di-assign) | OK |
| `tasks/[id]` | member hanya miliknya; PM milik/assigned. ADMIN dan VIEWER melihat semua | OK, lihat catatan 2 |
| `projects/page`, `projects/[id]` + tab | member hanya project yang ia ikuti; Settings tab hanya `canEditThis`; Activity tab memakai client RLS | OK, lihat catatan 2 |
| `workstreams/page`, `task-suggestions/page`, `task-suggestions/[id]` | filter scope (PM project miliknya, member usulan sendiri); detail: pembuat/PM/admin | OK |
| `dashboard` (`Sections`, `ProjectGantt`, `lib/data/dashboard`) | semua lewat `getDashboardScope(userId, role)`; project pilihan Gantt divalidasi dalam scope | OK |
| `activity/page` | query log memakai client user (RLS); admin client hanya mencari id profil untuk filter nama actor | OK |
| `ActivityTimeline.resolveActorNames` | hanya nama profil dari id yang sudah ada di log yang boleh dibaca | OK |
| `task-suggestions/new` | `suggestions.create`; **workstream semua project dikirim ke browser** | **Diperbaiki** (catatan 1) |
| `lib/data/projects`, `meeting-access`, `meetings`, `suggestions`, `users` | helper murni; user id/role diberikan pemanggil yang sudah terautentikasi (semua pemanggil dicek di atas) | OK |
| `lib/activity-log/service`, `lib/notifications/*`, `lib/monitoring/send-error-alert` | pemanggil internal server (tidak diekspos sebagai action); tidak menerima input mentah dari browser | OK |
| `lib/meetings/digest`, `lib/meetings/scheduler` | hanya dipanggil dari route cron yang dijaga `CRON_SECRET` | OK |

## Catatan

1. **Diperbaiki** `app/(app)/task-suggestions/new/page.tsx`: sebelumnya memuat 1000 workstream dari SEMUA project dan mengirimnya ke browser, termasuk milik project yang tidak boleh diusulkan user (TEAM_MEMBER/PM). Sekarang hanya workstream dari `getSuggestableProjects`. Aturan ini tidak murni (query DB), jadi tidak ada unit test; tercakup `tsc`/lint/build.
2. **Risiko rendah, butuh keputusan pemilik** (sudah tercatat di `docs/rbac-matrix-hasil.md`): `projects/[id]` terbuka untuk PM project lain dan VIEWER (nama project, workstream, jumlah, anggota); `tasks/[id]` terbuka untuk VIEWER. Juga `fetchTaskLookups` (dropdown filter `/tasks`) memuat semua project/workstream untuk semua role, dan `getActiveUsers()` memberi daftar user aktif (nama + email) ke setiap role yang bisa membuat usulan. Membatasi ini mengubah perilaku produk, jadi tidak diubah di sini.
3. Tidak ada pemindahan ke client RLS: alasannya di ringkasan. Kandidat paling masuk akal (daftar notifikasi milik sendiri, preferensi) tulisnya memang tanpa policy RLS tulis, dan manfaatnya kecil dibanding risiko regresi.
