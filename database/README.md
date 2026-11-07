# database/

## Satu sumber yang dijalankan

| Folder | Isi | Dijalankan ke database? |
| --- | --- | --- |
| `migrations/NNN_*.sql` | SQL tulisan tangan, berurutan | **Ya. Satu-satunya sumber resmi.** |
| `migrations/down/NNN_*.down.sql` | Rollback (mulai 011) | Hanya saat membatalkan |
| `drizzle/` | Snapshot skema tabel dari `lib/db/schema.ts` | **Tidak pernah.** Lihat `drizzle/README.md` |

Fungsi, trigger, dan policy RLS (mis. 012–014) hanya ada di `migrations/`,
karena Drizzle tidak mengelolanya. `drizzle/` hanya perlu diperbarui bila
**tabel atau kolom** berubah.

## Catatan migrasi yang sudah jalan

Tabel `public.app_migrations` (migrasi 015) berisi versi yang sudah
dijalankan di database itu. Cek selisih file vs database:

```bash
npm run db:status        # butuh Supabase CLI yang sudah login
```

## Tes RLS dan hak akses

```bash
npm run test:rls         # 26 cek, butuh Supabase CLI yang sudah login
```

`database/tests/rls.check.sql` dijalankan ke database dalam transaksi yang **selalu
di-rollback** (aman di produksi). Isinya: user ACTIVE bisa baca, INACTIVE dan
INVITED tidak bisa baca 14 tabel, user tidak bisa ubah role sendiri atau
insert langsung, anon tertutup, RPC/tabel sensitif hanya service role,
pendaftar yang minta ADMIN tetap TEAM_MEMBER + INACTIVE. Tidak masuk CI karena
butuh kredensial; jalankan setiap habis mengubah policy atau fungsi.
Tambah/kurangi cek = ubah juga `EXPECTED_TOTAL` di `scripts/test-rls.mjs`.

Matriks izin per role di aplikasi (`lib/auth/permissions.ts`) dites di
`tests/permissions.check.ts` dan ikut `npm run test:logic` (CI).

## Alur menambah migrasi

0. Buat backup dulu: `npm run db:backup` (lihat `docs/backup.md`).
1. Tulis `migrations/NNN_nama.sql` dan `migrations/down/NNN_nama.down.sql`.
   Akhiri file naik dengan:
   `insert into public.app_migrations (version, name) values ('NNN', 'NNN_nama') on conflict do nothing;`
   dan file turun dengan `delete from public.app_migrations where version = 'NNN';`
2. Uji dulu di produksi dalam transaksi yang dibatalkan (`begin;` + isi file +
   blok uji yang diakhiri `raise exception`), lalu pastikan tidak ada sisa.
3. Jalankan: `supabase db query --remote=<project-ref> -f database/migrations/NNN_nama.sql`
   (atau tempel di Supabase Dashboard > SQL Editor).
4. `npm run db:status` harus bersih dan `npm run test:rls` lulus. Tulis status dan hasil uji di header file.
5. Bila tabel/kolom berubah: perbarui `lib/db/schema.ts`, `npm run db:generate`,
   commit snapshot di `drizzle/` (jangan dijalankan).
6. Deploy kode yang bergantung pada migrasi **sesudah** migrasi jalan.

Migrasi 001–010 tidak punya file rollback: isinya fondasi skema yang sudah
berisi data; membatalkannya berarti kehilangan data.
