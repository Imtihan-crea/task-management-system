# Backup harian lewat email

Selama Supabase masih paket gratis (tanpa backup otomatis), aplikasi mengirim
backup terenkripsi setiap hari ke alamat di `BACKUP_EMAIL_TO`. Ini pengaman
tambahan di samping `npm run db:backup` (lihat `docs/backup.md`), bukan penggantinya.

## Cara kerja

- Pemicu: Vercel Cron `/api/cron/backup` (`vercel.json`, `0 19 * * *` UTC =
  02:00 WIB; paket Hobby menjalankannya kapan saja di jam itu, jadi 02:00 sampai 03:00 WIB).
  Super Admin/Developer juga bisa menekan **Kirim backup sekarang** di Pengaturan.
- Isi: akun login lengkap (`auth.users` dan `auth.identities`, lewat fungsi
  `public.backup_auth_export()` dari migrasi 028) lalu semua tabel skema
  `public` (daftar di `lib/backup/backup.ts`, urut aman untuk dipulihkan).
  `auth.users` memuat **hash password** (`encrypted_password`, bcrypt), jadi
  setelah dipulihkan user login dengan password lamanya. Hanya token sementara
  (konfirmasi, recovery, ganti email/telepon, reauthentication) yang dikosongkan.
- Migrasi 028 wajib sudah jalan sebelum versi ini dipasang; tanpa fungsi itu
  backup gagal (`BACKUP_FAILED`, alasan `read`), tidak terkirim tanpa akun.
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

**Berkas backup memuat hash password semua akun.** Siapa pun yang memegang
berkas dan passphrase bisa mencoba menebak password dari hash itu. Jaga
passphrase seketat kunci produksi: jangan kirim lewat chat atau email, jangan
tulis di repo. Bila passphrase bocor, ganti `BACKUP_PASSPHRASE` dan minta semua
user mengganti password (backup lama tetap terbuka dengan passphrase lama).

## Membuka berkas

Dari root repo (Node 20 ke atas):

```bash
node scripts/backup/decrypt.mjs tms-backup-2026-11-20.tmsbak.txt > backup.json
```

Passphrase diketik saat diminta (tidak tampil), atau diberikan lewat env
`BACKUP_PASSPHRASE`. Jangan menulis passphrase sebagai argumen perintah (masuk
riwayat shell). Passphrase salah atau berkas diubah = `GAGAL: Passphrase salah
atau berkas rusak.` dan tidak ada keluaran.

`backup.json` berisi data pribadi dan hash password tanpa enkripsi: simpan di
luar repo, hapus setelah dipakai.

## Memulihkan ke database

Pulihkan ke **project Supabase baru/kosong**, bukan menimpa produksi yang masih
hidup. Bila backup `npm run db:backup` (pg_dump) lebih baru, pakai itu (lebih
lengkap: skema, policy, role). Urutan: skema, akun login, lalu `profiles` dan
tabel lain.

1. Pasang skema: jalankan semua berkas `database/migrations/*.sql` berurutan
   (lihat `database/README.md`).
2. Siapkan data di folder di luar repo (butuh `jq`):
   ```bash
   jq -c '.tables["auth.users"]'      backup.json > users.json
   jq -c '.tables["auth.identities"]' backup.json > identities.json
   for t in $(jq -r '.tables | keys_unsorted[] | select(startswith("auth.") | not)' backup.json); do
     jq -c --arg t "$t" '.tables[$t]' backup.json > "public-$t.json"
   done
   ```
3. Jalankan di **satu** sesi `psql` ke project baru (connection string dari
   Dashboard > Connect, jangan ditulis ke repo):
   ```sql
   \set users `cat users.json`
   \set identities `cat identities.json`
   begin;
   -- Lewati trigger dan cek FK selama memuat (trigger on_auth_user_created
   -- tidak membuat profil kosong; baris anak boleh datang sebelum induknya).
   set session_replication_role = replica;

   -- Akun login dulu: id, hash password, status konfirmasi, dan metadata sama
   -- persis, jadi user masuk dengan password lamanya. Kolom generated
   -- (confirmed_at, identities.email) tidak ikut di-insert.
   insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
     email_confirmed_at, invited_at, confirmation_token, confirmation_sent_at,
     recovery_token, recovery_sent_at, email_change_token_new, email_change,
     email_change_sent_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data,
     is_super_admin, created_at, updated_at, phone, phone_confirmed_at, phone_change,
     phone_change_token, phone_change_sent_at, email_change_token_current,
     email_change_confirm_status, banned_until, reauthentication_token,
     reauthentication_sent_at, is_sso_user, deleted_at, is_anonymous)
   select instance_id, id, aud, role, email, encrypted_password,
     email_confirmed_at, invited_at, confirmation_token, confirmation_sent_at,
     recovery_token, recovery_sent_at, email_change_token_new, email_change,
     email_change_sent_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data,
     is_super_admin, created_at, updated_at, phone, phone_confirmed_at, phone_change,
     phone_change_token, phone_change_sent_at, email_change_token_current,
     email_change_confirm_status, banned_until, reauthentication_token,
     reauthentication_sent_at, is_sso_user, deleted_at, is_anonymous
   from jsonb_populate_recordset(null::auth.users, :'users'::jsonb);

   insert into auth.identities (provider_id, user_id, identity_data, provider,
     last_sign_in_at, created_at, updated_at, id)
   select provider_id, user_id, identity_data, provider,
     last_sign_in_at, created_at, updated_at, id
   from jsonb_populate_recordset(null::auth.identities, :'identities'::jsonb);
   ```
   Lalu tabel public, satu per satu **dengan urutan kunci `tables` di berkas**
   (`profiles`, `projects`, `workstreams`, ... , `client_lead_events`). Isi
   bawaan migrasi (mis. `app_migrations`) dihapus dulu supaya diganti data backup:
   ```sql
   \set rows `cat public-profiles.json`
   delete from public.profiles;
   insert into public.profiles
   select * from jsonb_populate_recordset(null::public.profiles, :'rows'::jsonb);
   -- ulangi untuk setiap tabel berikutnya, lalu:
   set session_replication_role = origin;
   commit;
   ```
   Kolom auth di atas sesuai skema Supabase Auth 19 Nov 2026. Bila Supabase
   menambah kolom wajib, `insert` gagal dengan nama kolomnya: tambahkan kolom
   itu ke daftar (kunci JSON di `users.json` memuat semua kolom saat backup).
4. Cek urutan kode berurutan dengan `npm run db:check-seq` (hanya membaca);
   bila ada tanda, naikkan sequence yang disebut sampai melewati kode terbesar.
5. Cek jumlah baris per tabel sama dengan `meta.tables`, coba login dengan satu
   akun lama, lalu ikuti langkah "Sesudah restore" di `docs/backup.md` (RLS,
   env Vercel, Auth, pg_cron).

Catatan: tabel dibaca satu per satu, bukan dalam satu transaksi. Perubahan
yang terjadi tepat saat backup berjalan (sekitar 02:00 WIB) bisa membuat satu
baris anak tanpa induknya; `session_replication_role = replica` mengizinkan
insert itu, lalu periksa manual.
