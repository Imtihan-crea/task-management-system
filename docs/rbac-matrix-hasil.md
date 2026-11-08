# Matriks RBAC end-to-end (hasil uji 9 Nov 2026)

Dibuat oleh `npm run e2e:rbac` (`scripts/e2e/rbac.mjs`) terhadap build `afk2/fase1-uji` yang dijalankan lokal (`next start`, email mati). Setiap role membuka tiap halaman aplikasi; dicatat akses akhir dan tombol aksi yang tampil, lalu dibandingkan dengan aturan di `lib/auth/permissions.ts`, `lib/auth/task-access.ts`, `lib/auth/project-access.ts`, `lib/meetings/rules.ts` dan guard tiap halaman. **Tidak ada yang diperbaiki di fase ini; hanya dicatat.**

## Data dan role uji

Semua data berawalan `UJI-E2E` dan sudah dihapus permanen setelah uji (sisa project, task, meeting, profil = 0).

| Kolom | Role | Keadaan |
|---|---|---|
| ADMIN | Admin sungguhan (sesi dari link recovery sekali pakai, password tidak diubah) | semua |
| PM_A | PROJECT_MANAGER | PM Project A (project uji) |
| PM_B | PROJECT_MANAGER | PM Project B (project uji lain), bukan PM Project A |
| MEMBER | TEAM_MEMBER | punya 1 task di Project A, peserta Meeting A, pembuat 1 usulan task |
| VIEWER | VIEWER | tanpa keterlibatan |

Halaman `[id]` memakai: task A1 (assignee MEMBER, Project A), Meeting A (penyelenggara PM_A, peserta MEMBER, Project A), usulan task PENDING dari MEMBER di Project A, dan user MEMBER untuk `users/[id]`.

## Cara membaca tabel

- `boleh` = halaman terbuka di URL yang diminta. `404` = halaman "tidak ditemukan". `redirect /x` = dialihkan. `pesan izin` = halaman terbuka tetapi hanya menampilkan "tidak punya izin".
- `[...]` = kategori tombol aksi yang terlihat: `add` (tambah/buat), `edit`, `delete` (hapus task/project/workstream), `delete-item` (hapus item agenda/peserta/workstream), `status` (Perbarui), `submit` (Submit sebagai Done/Evidence), `cancel-task`, `approve` (Setujui/Tolak/Minta Revisi), `complete`/`cancel` (meeting), `suggest` (Usulkan Task).
- **tebal + ⚠** = tidak sesuai aturan yang dimaksud.
- Pada tab project (`?tab=...`) dan tab meeting hanya akses yang dibandingkan, kecuali `settings` (harus ada `edit` untuk Admin/PM_A) dan `workstreams` (harus ada `add`).

| Halaman | ADMIN | PM_A | PM_B | MEMBER | VIEWER |
|---|---|---|---|---|---|
| `dashboard` | boleh | boleh | boleh | boleh | boleh |
| `tasks` | boleh [add, suggest] | boleh [add, suggest] | boleh [add, suggest] | boleh [suggest] | boleh |
| `tasks/[id]` | boleh [cancel-task, delete, edit, status, submit] | boleh [cancel-task, delete, edit, status, submit] | 404 | boleh [cancel-task, status, submit] | boleh |
| `tasks/new` | boleh [add] | boleh [add] | boleh [add] | redirect /dashboard | redirect /dashboard |
| `projects` | boleh [add] | boleh [add] | boleh [add] | boleh | boleh |
| `projects/[id]` | boleh [suggest] | boleh [suggest] | boleh | boleh [suggest] | boleh |
| `projects/[id] ?tab=tasks` | boleh [add, suggest] | boleh [add, suggest] | boleh | boleh [suggest] | boleh |
| `projects/[id] ?tab=workstreams` | boleh [add, delete-item, suggest] | boleh [add, delete-item, suggest] | boleh | boleh [suggest] | boleh |
| `projects/[id] ?tab=meetings` | boleh [add, suggest] | boleh [add, suggest] | boleh | boleh [add, suggest] | boleh |
| `projects/[id] ?tab=activity` | boleh [suggest] | boleh [suggest] | boleh | boleh [suggest] | boleh |
| `projects/[id] ?tab=members` | boleh [suggest] | boleh [suggest] | boleh | boleh [suggest] | boleh |
| `projects/[id] ?tab=settings` | boleh [edit, suggest] | boleh [edit, suggest] | boleh | boleh [suggest] | boleh |
| `workstreams/new` | boleh [add] | boleh [add] | 404 | redirect /dashboard | redirect /dashboard |
| `meetings` | boleh [add] | boleh [add] | boleh [add] | boleh [add] | **boleh [add]** ⚠ |
| `meetings/new` | boleh [add] | boleh [add] | boleh [add] | boleh [add] | redirect /dashboard |
| `meetings/[id]` | boleh [add, cancel, complete, delete-item, edit] | boleh [add, cancel, complete, delete-item, edit] | 404 | boleh | 404 |
| `meetings/[id] ?tab=agenda` | boleh | boleh | 404 | boleh | 404 |
| `meetings/[id] ?tab=notes` | boleh | boleh | 404 | boleh | 404 |
| `meetings/[id] ?tab=decisions` | boleh | boleh | 404 | boleh | 404 |
| `meetings/[id] ?tab=actions` | boleh [add] | boleh [add] | 404 | boleh [add] | 404 |
| `task-suggestions` | boleh [suggest] | boleh [suggest] | boleh [suggest] | boleh [suggest] | boleh |
| `task-suggestions/new` | boleh [suggest] | boleh [suggest] | boleh [suggest] | boleh [suggest] | pesan izin |
| `task-suggestions/[id]` | boleh [approve] | boleh [approve] | 404 | boleh | 404 |
| `activity` | boleh | boleh | boleh | boleh | boleh |
| `users` | boleh [add] | redirect /dashboard | redirect /dashboard | redirect /dashboard | redirect /dashboard |
| `users/[id]` | boleh [edit] | redirect /dashboard | redirect /dashboard | redirect /dashboard | redirect /dashboard |
| `users/new` | boleh [add] | redirect /dashboard | redirect /dashboard | redirect /dashboard | redirect /dashboard |
| `notifications` | boleh | boleh | boleh | boleh | boleh |
| `profile` | boleh | boleh | boleh | boleh | boleh |

## Ketidaksesuaian

Hasil: 145 kombinasi halaman x role diuji, **1 ketidaksesuaian**.

1. **VIEWER melihat tombol "+ Buat Meeting" di `/meetings`** (`meetings.create` tidak dimiliki VIEWER). Klik tombol berujung redirect ke `/dashboard?denied=1` (guard `/meetings/new` benar). Kosmetik: tombol seharusnya disembunyikan.

## Catatan (sesuai `permissions.ts`, tetapi tidak konsisten; butuh keputusan pemilik)

Bukan ketidaksesuaian terhadap aturan tertulis, tetapi layak diputuskan:

1. **Cakupan baca tidak seragam.** PM_B (bukan PM Project A) dan VIEWER bisa membuka halaman Project A dan melihat daftar semua project (`projects.view` bagi semua role), tetapi task di project itu `404` bagi PM_B dan tidak ada akses meeting/usulan untuk VIEWER. VIEWER juga melihat seluruh daftar task dan membuka detail task milik siapa pun (`tasks.view`, tanpa pembatasan project). Jika VIEWER/PM lain memang hanya boleh melihat yang terkait, perlu guard di `projects/[id]` dan `tasks/[id]`.
2. **MEMBER (assignee) melihat tombol `Batalkan Task`.** Sesuai `canActOnTask` (assignee boleh ubah status/submit/batalkan), dicatat agar disengaja.

## Tidak diuji

- Aksi tulis per role (klik submit/approve/hapus) tidak dijalankan; hanya keberadaan tombol dan guard halaman. Aksi tulis admin dan alur PM/MEMBER ada di `npm run e2e:write`; penegakan di server action diuji di `tests/*-access.check.ts`.
- Halaman `/settings`, `/workstreams` (daftar), `/change-password`, `/accept-invite`.
- Isi `/activity` per role (hanya akses halaman).
