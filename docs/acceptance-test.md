# Acceptance Test — Phase 1 & Phase 2

Dijalankan setelah deploy ke production.

Production URL: `https://task-management-system-jatc.vercel.app`

## 1. Authentication (Phase 1)

| # | Langkah | Harap |
|---|---|---|
| 1.1 | Buka `/dashboard` tanpa login | Redirect ke `/login` |
| 1.2 | Login dengan email + password salah | `Invalid email or password.` |
| 1.3 | Login berhasil | Masuk `/dashboard`, nama & role tampil |
| 1.4 | Klik Logout | Kembali ke `/login` |
| 1.5 | Setelah logout, tekan Back | Tetap di `/login` |

## 2. Responsive

| # | Perangkat | Harap |
|---|---|---|
| 2.1 | Desktop 1280px+ | Table user tampil, tidak terpotong |
| 2.2 | Tablet 768px+ | Layout rapi |
| 2.3 | Mobile 320px+ | Table berubah jadi card, tidak geser horizontal |

## 3. User List (Admin)

| # | Langkah | Harap |
|---|---|---|
| 3.1 | Admin buka `/users` | List user tampil |
| 3.2 | Search nama | Case-insensitive, hasil sesuai |
| 3.3 | Search email | Hasil sesuai |
| 3.4 | Filter Role = Viewer | Hanya Viewer |
| 3.5 | Filter Status = INACTIVE | Hanya nonaktif |
| 3.6 | Filter Role + Status bersamaan | Kombinasi keduanya |
| 3.7 | Sort Created Date | Default terbaru dulu |
| 3.8 | Sort Name / Status / Role | Berubah sesuai pilihan |
| 3.9 | Filter tidak ada yang cocok | Empty state, bukan error |

## 4. Invite User

| # | Langkah | Harap |
|---|---|---|
| 4.1 | Invite email baru + role | `Invitation sent successfully.` atau link untuk dikirim manual | |
| 4.2 | User baru muncul di list | Status `INVITED` |
| 4.3 | Invite email yang sama | `A user with this email already exists.` |
| 4.4 | Invite tanpa email | Ditolak, pesan validation |
| 4.5 | Cek Table Editor `profiles` | Tidak ada baris duplikat |

## 5. Role & Status

| # | Langkah | Harap |
|---|---|---|
| 5.1 | Buka `/users/[id]` | Detail lengkap tampil |
| 5.2 | Ganti role `TEAM_MEMBER` → `PROJECT_MANAGER` | `User role updated successfully.` |
| 5.3 | Refresh halaman | Role tersimpan |
| 5.4 | Ganti Full Name | `User updated successfully.` |
| 5.5 | Coba edit Email | Field read-only |
| 5.6 | Deactivate user | `User deactivated successfully.` |
| 5.7 | User inactive coba login | `Your account is inactive. Please contact an administrator.` |
| 5.8 | Session user yang di-deactivate masih terbuka | Redirect ke `/login?reason=inactive` |
| 5.9 | Activate user lagi | `User activated successfully.` |
| 5.10 | Login lagi | Bisa masuk |

## 6. Authorization

| # | Aktor | Aksi | Harap |
|---|---|---|---|
| 6.1 | Tanpa login | `/users` | Redirect `/login` |
| 6.2 | `VIEWER` | `/users` | Access denied, kembali `/dashboard` |
| 6.3 | `TEAM_MEMBER` | `/users` | Access denied |
| 6.4 | `PROJECT_MANAGER` | `/users` | Access denied |
| 6.5 | `VIEWER` | `/users` via URL langsung | Access denied |
| 6.6 | Non-Admin | Menu `Users` | Tidak terlihat di navigasi |

## 7. Business Rules

| # | Skenario | Harap |
|---|---|---|
| 7.1 | Admin deactivate dirinya sendiri | `You cannot deactivate your own account.` |
| 7.2 | Admin ubah role dirinya sendiri jadi `VIEWER` | `At least one active administrator must remain.` |
| 7.3 | Hanya ada 1 Admin aktif,|deactivate dia | `At least one active administrator must remain.` |
| 7.4 | User biasa coba ubah role sendiri | Gagal, database menolak |
| 7.5 | Password user | Tidak pernah tampil di halaman mana pun |

## 8. Profile Self-Service

| # | Langkah | Harap |
|---|---|---|
| 8.1 | Buka `/profile` | Email, role, status, created date tampil |
| 8.2 | Ubah Full Name | `Profile updated successfully.` |
| 8.3 | Nama baru tampil di dashboard | Ya |
| 8.4 | Coba ubah role sendiri | Tidak ada field untuk itu |

## 9. Dashboard Statistics

| # | Langkah | Harap |
|---|---|---|
| 9.1 | Admin buka `/dashboard` | Total / Active / Inactive / Invited tampil |
| 9.2 | Angka cocok dengan jumlah user di list | Ya |
| 9.3 | Non-Admin buka `/dashboard` | Statistik tidak tampil |
| 9.4 | Angka berubah setelah invite/deactivate | Ya, bukan hard-coded |

## 10. Error & Loading States

| # | Skenario | Harap |
|---|---|---|
| 10.1 | Klik tombol invite 2x cepat | Tombol disabled, tidak dobel |
| 10.2 | Buka halaman saat data loading | Ada loading state |
| 10.3 | Error database | `Something went wrong. Please try again.` |
| 10.4 | Cek halaman | Tidak ada `PostgrestError` atau SQL mentah |

## 11. Production

| # | Cek | Harap |
|---|---|---|
| 11.1 | Buka production URL dari HP (bukan localhost) | Bisa |
| 11.2 | Login dari HP | Bisa |
| 11.3 | Login dari laptop | Bisa |
| 11.4 | Dua user berbeda | Keduanya melihat data yang sama |
| 11.5 | Cek Network tab | Tidak ada service role key di request |

---

## 12. Phase 3 & 4 — Task, Project, Workstream

| # | Langkah | Harap |
|---|---|---|
| 12.1 | Admin buat project + 2 PM | Project tersimpan, kedua PM tampil |
| 12.2 | PM buat workstream + task + assign member | Berhasil, deadline tersimpan |
| 12.3 | Buka project detail | Progress % = done/total, workstream + task tampil |
| 12.4 | Member login, buka /tasks | Hanya task miliknya, unfinished di atas |
| 12.5 | Member ubah status task miliknya ke DONE | Berhasil, PM menerima email + link evidence |
| 12.6 | Member submit evidence (link) | Link tampil dan bisa diklik di detail |
| 12.7 | Member buka task orang lain via URL | 404 / tidak bisa akses |
| 12.8 | PM buka project PM lain | Bisa lihat, tombol edit/tambah tidak ada |
| 12.9 | PM coba edit project PM lain via aksi langsung | Ditolak |
| 12.10 | Viewer buka /tasks/new | Ditolak |
| 12.11 | Hapus workstream yang punya task | Ditolak, pesan jelas |
| 12.12 | Soft delete task | Hilang dari list, tetap di database |
| 12.13 | Assign ke user INACTIVE | Ditolak |
| 12.14 | Mobile: /projects, /tasks | Card rapi, tidak geser horizontal |

## Catatan

Setiap pesan error harus user-friendly, bukan SQL mentah atau `PostgrestError`
yang mentah.
