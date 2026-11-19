# Backup harian lewat email

Selama Supabase masih paket gratis (tanpa backup otomatis), aplikasi mengirim
backup terenkripsi setiap hari ke alamat di `BACKUP_EMAIL_TO`. Ini pengaman
tambahan di samping `npm run db:backup` (lihat `docs/backup.md`), bukan penggantinya.

## Cara kerja

- Pemicu: Vercel Cron `/api/cron/backup` (`vercel.json`, `0 19 * * *` UTC =
  02:00 WIB; paket Hobby menjalankannya kapan saja di jam itu, jadi 02:00 sampai 03:00 WIB).
  Super Admin/Developer juga bisa menekan **Kirim backup sekarang** di Pengaturan.
- Isi: semua tabel skema `public` (daftar di `lib/backup/backup.ts`, urut aman
  untuk dipulihkan) plus `auth.users` minimal: `id`, `email`, `created_at`,
  `last_sign_in_at`. Hash password dan token **tidak** ikut.
- Format: JSON `{ meta, tables }`, di-gzip, dienkripsi AES-256-GCM. Kunci dari
  `BACKUP_PASSPHRASE` lewat scrypt dengan salt acak per berkas. Berkas lampiran
  `tms-backup-YYYY-MM-DD.tmsbak.txt` berupa teks (baris `TMSBAK1` + base64)
  karena Brevo hanya menerima ekstensi tertentu.
- Hasil tercatat di Activity: `BACKUP_SENT` atau `BACKUP_FAILED` (alasan:
  `config`, `read`, `too_large`, `email`).
- Lampiran lebih dari 8 MB tidak dikirim; penerima mendapat email
  `[Backup TMS GAGAL]` dan Activity mencatat `too_large`.

Env (Vercel): `CRON_SECRET` (sudah ada), `BACKUP_PASSPHRASE` (minimal 12
karakter), `BACKUP_EMAIL_TO` (boleh beberapa, dipisah koma), plus env Brevo
yang sudah dipakai email lain. **Passphrase wajib juga disimpan di password
manager pemilik**: tanpa itu semua backup tidak bisa dibuka.

## Membuka berkas

Dari root repo (Node 20 ke atas):

```bash
node scripts/backup/decrypt.mjs tms-backup-2026-11-20.tmsbak.txt > backup.json
```

Passphrase diketik saat diminta (tidak tampil), atau diberikan lewat env
`BACKUP_PASSPHRASE`. Jangan menulis passphrase sebagai argumen perintah (masuk
riwayat shell). Passphrase salah atau berkas diubah = `GAGAL: Passphrase salah
atau berkas rusak.` dan tidak ada keluaran.

`backup.json` berisi data pribadi: simpan di luar repo, hapus setelah dipakai.

## Memulihkan ke database

Pulihkan ke **project Supabase baru/kosong**, bukan menimpa produksi yang masih
hidup. Bila backup `npm run db:backup` (pg_dump) tersedia, pakai itu dulu: lebih
lengkap (skema, policy, akun login dengan password). Backup email dipakai bila
backup laptop tidak ada atau lebih lama.

1. Pasang skema: jalankan semua berkas `database/migrations/*.sql` berurutan
   (lihat `database/README.md`).
2. Buat ulang akun login dari `tables["auth.users"]` dengan **id yang sama**
   (tabel `profiles` dan lainnya merujuk id itu), mis. lewat Admin API
   `supabase.auth.admin.createUser({ id, email, email_confirm: true })`.
   Password tidak ada di backup: setiap user harus diundang ulang atau
   mereset password. Trigger `on_auth_user_created` membuat baris `profiles`
   baru, dan migrasi mengisi `app_migrations`; kosongkan keduanya di project
   baru itu sebelum langkah 3 supaya isinya diganti data backup.
3. Masukkan data per tabel dengan urutan kunci `tables` di berkas (sama dengan
   `BACKUP_TABLES`: `profiles`, `projects`, `workstreams`, ... ,
   `client_lead_events`; induk sebelum anak). Bila ada referensi ke baris di
   tabel yang sama atau urutan bentrok, jalankan di satu sesi `psql` dengan
   `SET session_replication_role = replica;` sebelum insert dan
   `SET session_replication_role = origin;` sesudahnya.
   Contoh per tabel di `psql`:
   ```sql
   insert into public.projects
   select * from jsonb_populate_recordset(null::public.projects, :'rows'::jsonb);
   ```
   dengan `rows` = isi `tables.projects` (mis. `jq -c .tables.projects backup.json`).
4. Cek urutan kode berurutan dengan `npm run db:check-seq` (hanya membaca);
   bila ada tanda, naikkan sequence yang disebut sampai melewati kode terbesar.
5. Cek jumlah baris per tabel sama dengan `meta.tables`, lalu ikuti langkah
   "Sesudah restore" di `docs/backup.md` (RLS, env Vercel, Auth, pg_cron).

Catatan: tabel dibaca satu per satu, bukan dalam satu transaksi. Perubahan
yang terjadi tepat saat backup berjalan (sekitar 02:00 WIB) bisa membuat satu
baris anak tanpa induknya; `session_replication_role = replica` mengizinkan
insert itu, lalu periksa manual.
