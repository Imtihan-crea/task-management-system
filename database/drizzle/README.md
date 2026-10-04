# database/drizzle

Migrasi yang di-generate oleh **Drizzle ORM** (`lib/db/schema.ts`).

## Pemisahan tanggung jawab

| Folder | Isi | Status |
| --- | --- | --- |
| `database/migrations/` | 001–007, SQL tulisan tangan | **SUDAH jalan di production.** Riwayat resmi. Jangan diubah. |
| `database/drizzle/` | 0000_baseline + perubahan(setelah ini) | Baseline = dokumentasi. Perubahan baru = yang dipakai ke depan. |

## Kenapa dipisah

Migrasi 001–007 sudah pernah dijalankan di database production, jadi tidak
boleh di-*generate* ulang oleh Drizzle (dia akan mencoba membuat ulang tabel
yang sudah ada). Solusinya: jadikan skema saat ini sebagai **baseline**, lalu
semua perubahan berikutnya lewat Drizzle.

## Bukti baseline akurat

`0000_baseline_phase10.sql` adalah hasil `drizzle-kit generate` dari
`lib/db/schema.ts`, yang skemanya sudah dicocokkan 1:1 dengan database
production lewat OpenAPI PostgREST (10 tabel, semua kolom cocok).

Cara memverifikasi ulang kapan saja:

```bash
npm run db:generate
# harusnya: "No schema changes, nothing to migrate"
```

Kalau keluar migrasi baru padahal `lib/db/schema.ts` tidak kamu ubah, berarti
skema di file itu sudah tidak cocok dengan database.

## ⚠️ Aturan keselamatan

1. **DILARANG `drizzle-kit push`.** Perintah itu bisa DROP kolom/tabel tanpa
   konfirmasi. Tidak ada script `db:push` di `package.json` dengan sengaja.
2. **Selalu review SQL** hasil `db:generate` sebelum dijalankan.
3. **Jangan jalankan `0000_baseline_phase10.sql`.** File itu hanya referensi.
4. **Kredensial database tidak disimpan di repo.** Kalau nanti perlu
   `drizzle-kit migrate`/`pull`, isi lewat environment variable.
5. Semua tulis aplikasi tetap lewat **service role + Server Action** yang sudah
   mengecek role (`app/actions/*`). RLS tetap menolak write dari anon/user.

## Alur kerja

```bash
# 1. ubah lib/db/schema.ts
# 2. generate SQL + snapshot baru
npm run db:generate

# 3. baca file SQL yang muncul di folder ini
# 4. jalankan lewat Supabase Dashboard → SQL Editor
# 5. catat perubahannya di docs/ (laporan completion per fase)
```