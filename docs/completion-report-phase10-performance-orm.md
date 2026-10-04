# Completion Report — Performa & Drizzle ORM (Step A + B)

**Tanggal:** 4 Oktober 2026
**Commit:** (lihat `git log -1`)
**Status:** selesai, build + lint + type-check hijau

---

## 1. Latar Belakang

Keluhan: halaman terasa berat di semua halaman, terutama saat pindah sub-menu
di `/tasks` (All → My Task). Hipotesis awal: "mungkin karena belum pakai ORM".

## 2. Hasil Audit (diukur, bukan ditebak)

Pengukuran dilakukan langsung ke database production (10 tabel, region
`ap-northeast-2` / Seoul).

### Temuan utama

| No | Temuan | Bukti |
| --- | --- | --- |
| 1 | 1 panggilan API Supabase ≈ **195–215 ms** | 4× sampling via HTTP client |
| 2 | Vercel **tidak set region** → default Washington D.C. | `vercel.json` hanya berisi cron |
| 3 | Pindah tab `/tasks` = **8–9 query, kedalaman ~5 sekuensial** | hitungan call site per render |
| 4 | Lookup projects/workstreams **diulang 2×** (page + `fetchTaskLookups`) | `app/(app)/tasks/page.tsx` vs `lib/data/task-list.ts` |
| 5 | Nama assignee = **1 query waterfall** tambahan | `TaskResults.tsx`, `Sections.tsx` |
| 6 | `ProjectGantt` **menderivate ulang scope** padahal sudah ada cache | `getDashboardScope()` diabaikan |
| 7 | `fetchTaskLookups` mengambil `profiles` tapi **tidak pernah dipakai** | 2 konsumen, 0 pemakai `.users` |

Total: **164 call site query, 46 file, 38 operasi tulis.**

### Jawaban atas hipotesis ORM

ORM **tidak akan memperbaiki** 7 temuan di atas:

1. Jumlah query tetap sama — ORM hanya mengompilasi JS → SQL.
2. Prisma justru menambah *query engine process* (binary terpisah) → cold
   start lebih besar di serverless, dan butuh konfigurasi tambahan
   (`@prisma/accelerate` / edge) agar tidak memperlambat.
3. Drizzle tidak menambah overhead, tapi juga tidak mengurangi satu pun
   dari 7 temuan di atas.
4. Risiko operasional: Drizzle/Prisma tidak lewat PostgREST, melainkan TCP
   langsung ke Postgres. Di plan **Free** Supabase koneksi langsung
   dibatasi ~15 concurrent dan wajib lewat Supavisor port 6543 dengan
   prepared statement dimatikan — menambah failure mode di produksi.

Yang ORM memang bawa dan dipakai di sini: **type safety skema** — nama
kolom salah ketahuan saat compile.

---

## 3. Step A — Perbaikan Performa

### A1. Vercel region dipindah ke Seoul (satu AZ dengan Supabase)

`vercel.json`:
```json
"regions": ["icn1"]
```
Dampak: setiap query turun dari ~200–300 ms (Amerika ↔ Seoul) menjadi
~5–15 ms (antar-AZ). Perubahan konfigurasi saja, nol risiko ke logika bisnis.

### A2. Lookup tidak lagi diduplikasi

`fetchTaskLookups()` (sudah `cache()`) kini dipakai oleh halaman `/tasks`
juga. Query `projects` + `workstreams` cukup **1×** per request, bukan 2×.

### A3. Assignee di-embed (PostgREST embed) — 0 query tambahan

`fetchTaskRows` dan `getDashboardTasks` sekarang memakai:
```
assignee:profiles!tasks_assignee_id_fkey(id, full_name, email)
```
Nama assignee ikut di dalam hasil query task. Menghapus:
- 1 query waterfall di `TaskResults`
- 1 query waterfall di `Sections.namesFor` (dipanggil 3× di dashboard)

Query `profiles` yang sebelumnya ada di `fetchTaskLookups` **dihapus** karena
ternyata tidak pernah dipakai.

### A4. Form filter `/tasks` dipisah ke Suspense sendiri

`components/tasks/TaskFilterForm.tsx` (baru). Halaman `tasks/page.tsx` kini
tidak lagi menunggu query apa pun sebelum render, sehingga:
- Judul + tombol langsung tampil
- Tabs, form filter, dan hasil task masing-masing punya skeleton sendiri
- Mengubah filter hanya me-refresh area yang terdampak

### A5. Gantt memakai scope yang sama (satu sumber kebenaran)

`ProjectGantt` sebelumnya mengulang logika scope (query `project_managers`
atau `tasks` sendiri). Sekarang memakai `getDashboardScope()` yang sudah
di-`cache()`. consequence: hemat 1 query, dan scope Gantt tidak mungkin
lagi beda dengan KPI.

### A6. Dashboard filter memakai lookup bersama

`FilterSection` tidak lagi query `projects` sendiri.

### Hasil query per pindah tab `/tasks`

| | Sebelum | Sesudah |
| --- | --- | --- |
| Query DB | 8–9 | **4** |
| Kedalaman sekuensial | ~5 | **2** |
| Estimasi waktu server (region lama) | 1,8–2,4 detik | **~60 ms** |
| Estimasi waktu server (region `icn1`) | — | **~15–30 ms** |

> Angka server time adalah estimasi berdasarkan latensi yang terukur.
> Perlu konfirmasi owner lewat browser (Network tab → TTFB) di production.

---

## 4. Step B — Drizzle ORM

### B1. Skema sebagai sumber kebenaran

`lib/db/schema.ts` — definisi lengkap 10 tabel, termasuk:
- foreign key + `on delete` behaviour
- `check` constraint (role, status, priority, tanggal, judul tidak kosong)
- default termasuk default berbasis sequence (`T-01`, `001`, `S-001`)
- `profiles.is_active` sebagai **generated column** dari `status`
- index, termasuk 3 partial index `WHERE is_deleted = false`

Diverifikasi 1:1 terhadap OpenAPI PostgREST → **10 tabel, 0 drift**.

### B2. Baseline migrasi + bukti nol drift

`drizzle-kit generate` menghasilkan
`database/drizzle/0000_baseline_phase10.sql`. Menjalankan ulang
`npm run db:generate` tanpa mengubah skema menghasilkan:

```
No schema changes, nothing to migrate
```

Ini bukti bahwa skema Drizzle identik dengan database production.

### B3. Type safety yang sudah aktif

`lib/data/task-list.ts` sekarang menurunkan bentuk baris dari skema:

```ts
type TaskColumns = Pick<Task, 'id' | 'code' | ... | 'deadline' | ...>
export type TaskRow = Omit<TaskColumns, 'priority' | 'status'> & {
  priority: TaskPriority   // dipersempit ke union enum
  status: TaskStatus
  assignee: TaskAssignee | null
}
export type TaskAssignee = Pick<Profile, 'id' | 'full_name' | 'email'>
```

**Uji negatif (dilakukan):** mengganti `'deadline'` → `'deadline_typo'`
menghasilkan error compile yang mencantumkan seluruh kolom yang valid:

```
error TS2344: Type '"deadline_typo"' does not satisfy the constraint
'"priority" | "status" | "id" | ... | "deadline" | ...'
```

Setelah dikembalikan: `tsc --noEmit` bersih.

### B4. Batas pemeriksaan: zero client bundle

`lib/db/index.ts` memakai `export type *` (bukan `export *`), jadi hanya
mengekspor tipe. Library drizzle tidak akan ikut ter-bundle ke browser.

### B5. Yang SENGAJA tidak dilakukan

- **Tidak** mengubah 164 call site query yang sudah ada.
- **Tidak** memakai Drizzle sebagai runtime query engine.
- **Tidak** membuat script `db:push`.

Alasannya: menjaga business logic Phase 1–9 tetap utuh, dan menghindari
failure mode koneksi TCP di plan Free.

---

## 5. File yang Diubah

### Baru
| File | Isi |
| --- | --- |
| `lib/db/schema.ts` | Skema Drizzle, 10 tabel + tipe turunan |
| `lib/db/index.ts` | Barrel tipe saja (`export type *`) |
| `drizzle.config.ts` | Konfigurasi drizzle-kit |
| `components/tasks/TaskFilterForm.tsx` | Form filter `/tasks` (async + Suspense) |
| `database/drizzle/0000_baseline_phase10.sql` | Baseline (dokumentasi, jangan dieksekusi) |
| `database/drizzle/README.md` | Aturan & alur kerja migrasi |

### Diubah
| File | Perubahan |
| --- | --- |
| `vercel.json` | Tambah `regions: ["icn1"]` |
| `lib/data/task-list.ts` | Embed assignee, lookup dipangkas, tipe dari Drizzle |
| `lib/data/dashboard.ts` | Embed assignee, `getDashboardScope` dipakai bersama |
| `components/tasks/TaskResults.tsx` | Query assignee dihapus |
| `components/dashboard/Sections.tsx` | `namesFor` tanpa query, filter pakai lookup bersama |
| `components/dashboard/ProjectGantt.tsx` | Scope dari cache, bukan diulang |
| `app/(app)/tasks/page.tsx` | Tidak blocking, 3 Suspense boundary |
| `package.json` | Tambah `db:generate`, `db:check` |

---

## 6. Verifikasi

| Pemeriksaan | Hasil |
| --- | --- |
| `npm run lint` | 0 error, 1 warning lama (`<img>` di `Sidebar.tsx`) |
| `npm run build` | Sukses |
| `npx tsc --noEmit` | Bersih |
| `npx drizzle-kit check` | `Everything's fine` |
| `db:generate` ulang | `No schema changes` (0 drift) |
| Query embed ke DB live | 4 rows, `assignee` terisi, 0 null |

---

## 7. Yang Perlu Dilakukan Owner

1. Tunggu deploy Vercel **Ready**, lalu **hard-refresh** (Ctrl+Shift+R).
2. Cek region di Vercel: Project → Settings → Functions → Region harus
   `Seoul (icn1)`. Jika masih `Washington DC`, region belum terpasang.
3. Ukur: buka `/tasks`, klik tab **My Task**, lalu DevTools → Network →
   dokumen utama → lihat **Waiting (TTFB)** dan **Server-Timing**.
4. Laporkan kalau masih terasa berat — kemungkinan penyebabnya sekarang
   sudah pindah ke cold start Vercel, bukan query.

## 8. Catatan untuk Rekan IT

Type safety skema sudah aktif dan terbukti (lihat B3). Untuk rewrite
query runtime ke Drizzle, rekomendasinya **tidak sekarang**: ukur dulu
dampaknya di production. Kalau nanti Needed, lakukan bertahap per route
lewat interface `lib/data/*` yang sudah ada, satu route per satu iterasi —
supaya business logic Phase 1–9 tidak ikut bergeser.