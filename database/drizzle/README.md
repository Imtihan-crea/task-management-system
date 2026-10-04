# database/drizzle

Snapshot skema yang dihasilkan **Drizzle ORM** (`lib/db/schema.ts`).

## Tanggung jawab tiap folder

| Folder | Isi | Status |
| --- | --- | --- |
| `database/migrations/` | 001–008, SQL tulisan tangan | **Riwayat resmi** = yang benar-benar dijalankan di Supabase SQL Editor. |
| `database/drizzle/` | 0000_baseline (Fase 1–10) + 0001 (Fase 11) | Snapshot skema. **Dokumentasi saja, tidak dieksekusi.** |

## Kenapa dipisah

Migrasi 001–008 sudah pernah (atau akan) dijalankan di database production,
jadi tidak boleh di-*generate* ulang oleh Drizzle — dia akan mencoba membuat
ulang tabel yang sudah ada dan akan gagal.

Solusinya: jadikan skema saat ini sebagai **baseline**, lalu semua perubahan
berikutnya lewat Drizzle. Pasangannya:

| Migration | Isi | Padanan |
| --- | --- | --- |
| `0000_baseline_phase10.sql` | Fase 1–10 (10 tabel + stub `auth.users`) | `migrations/001`–`007` |
| `0001_phase11_meetings.sql` | Fase 11 Meeting (5 tabel baru + 3 kolom) | `migrations/008` |

Keduanya **setara** secara isi. Yang di folder ini hanya bentuk Drizzle-nya.

## Perbedaan yang disengaja antara `008` dan `0001`

Hanya satu: **nama foreign key**.

| Sumber | Nama FK untuk `meetings.project_id` |
| --- | --- |
| Postgres otomatis (yang jalan di `008`) | `meetings_project_id_fkey` |
| Drizzle (di `0001`) | `meetings_project_id_projects_id_fk` |

Tidak berpengaruh ke query, RLS, index, maupun aplikasi — yang menentukan
perilaku adalah `ON DELETE`, dan itu sama. Penyebabnya selisih ini ada: kita
memang **tidak pernah** menjalankan `drizzle-kit pull`/`migrate`, jadi nama FK
di database tidak pernah dipakai untuk membandingkan skema.

## Verifikasi 0-drift

```bash
npm run db:generate
# harusnya: "No schema changes, nothing to migrate"
```

Kalau keluar migrasi baru padahal `lib/db/schema.ts` tidak kamu ubah, berarti
`lib/db/schema.ts` sudah tidak sinkron dengan `database/migrations/`.

Status saat ini (4 Oktober 2026): **16 tabel** (11 tabel aplikasi + stub
`auth.users`), `tsc` bersih, `drizzle-kit check` OK, **No schema changes** ✅

## Aturan Keselamatan

1. **DILARANG `drizzle-kit push`.** Bisa DROP kolom/tabel tanpa konfirmasi.
   Tidak ada script `db:push` di `package.json` dengan sengaja.
2. **DILARANG `drizzle-kit pull` dan `drizzle-kit migrate`.** Keduanya butuh
   kredensial database langsung dan bisa menimpa data yang sudah ada.
3. **Selalu review SQL** hasil `db:generate` sebelum dipakai.
4. **Jangan jalankan file `.sql` di folder ini ke database.** Salin dulu isinya
   ke `database/migrations/NNN_*.sql`, lalu jalankan yang salinan itu.
5. **Kredensial database tidak disimpan di repo.** Kalau nanti benar-benar perlu
   `migrate`/`pull`, isi lewat environment variable, bukan file config.
6. Semua tulis aplikasi tetap lewat **service role + Server Action** yang sudah
   mengecek role (`app/actions/*`). RLS tetap menolak write dari anon/user.

## Alur kerja

```bash
# 1. ubah lib/db/schema.ts
# 2. generate SQL + snapshot baru
npm run db:generate

# 3. baca file SQL yang muncul di folder ini
# 4. salin ke database/migrations/NNN_*.sql
# 5. jalankan salinan itu via Supabase Dashboard -> SQL Editor
# 6. verifikasi 0-drift lagi
npm run db:generate   # harus "No schema changes"
# 7. catat perubahannya di docs/ (laporan completion per fase)
```