# Rencana RBAC (role & izin yang bisa diatur)

Status: **DITUNDA** (keputusan pemilik 8 Nov 2026). RBAC yang sudah ada
(4 role tetap + PM per project, lihat §2) dipakai dulu. Role eksternal seperti
`CLIENT` sangat opsional; akses pihak luar tetap **mati** (signup publik
dimatikan, user hanya lewat undangan admin). Dokumen ini disimpan sebagai
rujukan bila kebutuhan role/izin dari UI atau role per project muncul lagi.

## 1. Tujuan

Permintaan pemilik (8 Nov 2026):

1. **Role dan izin diatur admin dari UI**: membuat role baru, mencentang izin
   per role, mengganti role user, tanpa mengubah kode.
2. **Role per project**: user yang sama bisa berperan berbeda di project
   berbeda (mis. PM di project A, Viewer di project B).
3. **Role tetap baru** bisa ditambah (lewat seed/migrasi), mis. role untuk
   klien yang hanya melihat progres.

Di luar cakupan (diputuskan nanti): delegasi sementara, lead workstream,
pembatasan kolom, akses tamu bermasa berlaku, persetujuan berjenjang, divisi,
larangan rangkap tugas.

## 2. Kondisi sekarang

| Bagian | Sekarang |
| --- | --- |
| Role | 4 role tetap di kode: `ADMIN`, `PROJECT_MANAGER`, `TEAM_MEMBER`, `VIEWER` (`lib/auth/roles.ts`), kolom `profiles.role` dengan CHECK constraint. |
| Izin | Matriks tetap `ROLE_PERMISSIONS` di `lib/auth/permissions.ts` (28 izin), dipakai `can(role, izin)`; dites 116 cek. |
| Lingkup project | Hanya PM per project, tabel `project_managers`; dicek `canManageProjectFor` / `isProjectManager`. Anggota lain dilihat dari assignee task. |
| Nama role di kode | Ditulis langsung di 31 file (terbanyak `lib/auth/*`, `app/actions/tasks.ts`, `meetings.ts`, beberapa halaman). |
| Database | RLS restrictive "Only active users" (15 tabel); `is_admin()`, `can_read_meeting()` membaca `profiles.role` / `project_managers`. Semua tulis lewat service role. |
| Tes | `test:permissions`, `test:task-access`, `test:project-access`, `test:rls` (26 cek). |

## 3. Desain

### 3.1 Model data (migrasi baru)

```
roles
  key          text primary key      -- 'ADMIN', 'PROJECT_MANAGER', 'CLIENT', 'FINANCE', ...
  name         text not null         -- label tampilan
  description  text
  scope        text not null         -- 'global' | 'project'
  is_system    boolean not null      -- role bawaan: tidak bisa dihapus/diganti key
  created_at, updated_at

role_permissions
  role_key     text references roles(key) on delete cascade
  permission   text not null         -- kunci dari katalog izin di kode
  primary key (role_key, permission)

project_members                      -- menggantikan project_managers
  project_id   uuid references projects(id) on delete cascade
  user_id      uuid references profiles(id) on delete cascade
  role_key     text references roles(key)   -- harus role ber-scope 'project'
  primary key (project_id, user_id)
```

- `profiles.role` tetap ada (role **global**), CHECK constraint diganti
  foreign key ke `roles(key)`. Kode lama yang membaca `profile.role` tetap
  jalan selama transisi.
- **Katalog izin tetap di kode** (`lib/auth/permissions.ts`: daftar kunci +
  label + grup). UI hanya mencentang dari katalog ini; izin yang tidak ada di
  kode tidak bisa dibuat dari UI, karena kode yang menegakkannya juga tidak ada.
- `project_managers` dimigrasi ke `project_members` dengan `role_key =
  'PROJECT_MANAGER'`. Tabel lama dipertahankan sebagai view baca-saja selama
  transisi, lalu dihapus.

### 3.2 Aturan izin efektif

```
izin(user, project?) = izin role global user
                     ∪ izin role user di project itu (bila project diberikan)
ADMIN (role sistem)  = semua izin, tidak bisa dikurangi
```

- Satu fungsi pusat `can(profile, izin, { projectId? })` di server; semua
  `can(role, ...)`, `canManageProjectFor`, `canActOnTask`, dan cek
  `profile.role === '...'` di 31 file dipindah ke fungsi ini.
- Matriks role dari database dibaca sekali per request (cache per request),
  karena tabelnya kecil.
- Database: fungsi `has_permission(uid, izin, project_id)` (security definer)
  untuk RLS dan fungsi SQL yang sekarang memakai `is_admin()` / `project_managers`.

### 3.3 Pengaman (wajib)

- Hanya **ADMIN** yang bisa membuat atau mengubah role, izin, dan role global
  user. Izin kelompok `users.*` hanya boleh dimiliki role `ADMIN`, supaya
  role buatan tidak bisa menaikkan hak dirinya sendiri.
- Role sistem tidak bisa dihapus; `ADMIN` tidak bisa dikurangi izinnya.
- Rule 06 tetap: minimal satu ADMIN aktif.
- Role yang masih dipakai user atau anggota project tidak bisa dihapus
  (harus dipindah dulu).
- Setiap perubahan role, izin, dan keanggotaan dicatat di `activity_logs`
  (siapa, kapan, sebelum, sesudah).

### 3.4 UI

| Halaman | Isi | Akses |
| --- | --- | --- |
| `/settings/roles` | Daftar role, buat/ubah/hapus role, tabel centang izin per role, jumlah pemakai | ADMIN |
| `/users/[id]` (sudah ada) | Pilih role global dari daftar role database | ADMIN |
| `/projects/[id]` tab **Anggota** | Tambah/hapus anggota, pilih role project | ADMIN, atau user yang punya izin `projects.manageMembers` di project itu |

## 4. Tahapan

Setiap tahap: backup database dulu, uji migrasi dalam transaksi rollback,
gerbang lokal (`tsc`, `test:logic`, build, `check:secrets`, `test:rls`)
lulus, baru merge/push/deploy. Perilaku untuk user yang ada **tidak berubah**
sampai tahap 4.

| Tahap | Isi | Hasil yang bisa dilihat |
| --- | --- | --- |
| **1. Fondasi data** | Migrasi `roles`, `role_permissions`, `project_members`; seed 4 role bawaan dengan izin **persis** sama dengan matriks sekarang; backfill `project_managers` ke `project_members`; FK `profiles.role`. Tes: isi seed identik dengan `ROLE_PERMISSIONS`. | Tidak ada perubahan di aplikasi. |
| **2. Satu pintu izin** | `can(profile, izin, {projectId})` membaca database; ganti semua cek di 31 file; `has_permission()` di SQL, RLS dan fungsi lama dialihkan. Tes izin dan RLS diperluas. | Tidak ada perubahan perilaku (dibuktikan tes). |
| **3. Role tetap baru (poin 3)** | Tambah role baru lewat migrasi seed (daftar dari pemilik, lihat §6). | Role baru bisa dipilih untuk user. |
| **4. Role per project (poin 2)** | Tab Anggota di project; izin project dihitung dari `project_members`; aturan siapa melihat project mana (§6). | PM/Viewer per project. |
| **5. Atur dari UI (poin 1)** | `/settings/roles`, audit log, pengaman §3.3. | Admin membuat role dan mencentang izin. |
| **6. Bersih-bersih** | Hapus `project_managers` (view) dan kode lama; perbarui docs dan tes. | — |

Perkiraan kasar: tahap 1–2 paling berisiko (menyentuh semua cek izin), tahap
3–5 menambah fitur di atasnya. [INFERENCE: belum diukur]

## 5. Risiko dan mitigasi

| Risiko | Mitigasi |
| --- | --- |
| Celah akses saat memindah 31 file cek izin | Tahap 2 tanpa perubahan perilaku; tes izin per role/project sebelum dan sesudah harus identik; `test:rls` diperluas. |
| Admin terkunci keluar | ADMIN role sistem tak bisa dikurangi; Rule 06 tetap; migrasi punya file rollback. |
| Eskalasi hak lewat role buatan | Izin `users.*` dan pengelolaan role hanya untuk ADMIN. |
| RLS lambat karena cek izin per baris | `has_permission()` stable + index pada `project_members(user_id)` dan `role_permissions(role_key)`; ukur sebelum/sesudah. |
| Data `project_managers` hilang saat migrasi | Backfill dalam transaksi, cocokkan jumlah baris; tabel lama tetap sebagai view sampai tahap 6. |

## 6. Pertanyaan untuk pemilik (sebelum mulai)

1. **Role tetap baru apa saja** (poin 3)? Nama dan izinnya, mis. `CLIENT`:
   lihat project/task tempat ia diundang saja, tanpa menu user.
2. **Siapa boleh melihat project?** Sekarang semua user aktif melihat semua
   project. Dengan role per project: (a) tetap semua, atau (b) hanya anggota
   project + ADMIN (lebih ketat, mengubah perilaku untuk user yang ada).
3. **Role global vs project**: usul role global tetap ada (ADMIN dan role
   dasar seluruh kantor), role project menambah izin di project tertentu. Setuju?
4. **Siapa mengelola anggota project**: ADMIN saja, atau juga PM project itu?
5. Boleh role buatan punya izin kelola user (`users.*`)? Usul: **tidak**.
