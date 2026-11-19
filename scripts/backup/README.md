# Backup harian lewat email

Selama Supabase masih paket gratis (tanpa backup otomatis), aplikasi mengirim
backup terenkripsi setiap hari ke alamat di `BACKUP_EMAIL_TO`. Ini pengaman
tambahan di samping `npm run db:backup` (lihat `docs/backup.md`), bukan penggantinya.

## Cara kerja

- Pemicu: Vercel Cron `/api/cron/backup` (`vercel.json`, `0 19 * * *` UTC =
  02:00 WIB; paket Hobby menjalankannya kapan saja di jam itu, jadi 02:00 sampai 03:00 WIB).
  Super Admin/Developer juga bisa menekan **Kirim backup sekarang** di Pengaturan.
- Isi (semua di dalam satu berkas terenkripsi):
  - `tables`: akun login lengkap (`auth.users`, `auth.identities`, lewat fungsi
    `public.backup_auth_export()` migrasi 028) lalu semua tabel skema `public`
    (daftar di `lib/backup/backup.ts`, urut aman untuk dipulihkan): task,
    project, meeting, Daily Tracker, cuti, klien, notifikasi, activity log
    (riwayat), dan lainnya. `auth.users` memuat **hash password**
    (`encrypted_password`, bcrypt), jadi setelah dipulihkan user login dengan
    password lamanya. Hanya token sementara (konfirmasi, recovery, ganti
    email/telepon, reauthentication) yang dikosongkan.
  - `env`: nilai env aplikasi dari daftar tetap `ENV_KEYS` (Supabase URL/anon
    key/service role key, Brevo, `CRON_SECRET`, `APP_URL`, `TRACKER_*`,
    `BACKUP_EMAIL_TO`, Sentry). Bukan seluruh env server; variabel sistem
    Vercel dan `BACKUP_PASSPHRASE` sendiri tidak ikut. Kosong = `null`.
  - `db_config` (fungsi `public.backup_db_config()` migrasi 028): jadwal
    pg_cron (`cron.job`, perintahnya memuat `CRON_SECRET`), policy RLS skema
    public dan storage, definisi fungsi public, trigger, `storage.buckets`, dan
    metadata `storage.objects`.
  - `storage_files`: isi berkas storage (base64) bila totalnya di bawah 5 MB;
    di atas itu hanya daftarnya (`db_config.storage_objects`) dan email
    menyebut berapa berkas yang tidak ikut. Saat ini storage kosong.
  - `meta`: jumlah baris per tabel, status env (terisi/kosong, tanpa nilai),
    jumlah job cron/policy/fungsi/trigger/bucket, ringkasan storage.
- Email hanya berisi ringkasan `meta`; tidak ada nilai env, data, atau hash.
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

**Berkas backup memuat hash password semua akun dan kunci aplikasi**
(service role key Supabase yang bisa membaca/mengubah seluruh database, API
key Brevo, `CRON_SECRET`). Siapa pun yang memegang berkas dan passphrase
memegang kunci produksi dan bisa mencoba menebak password dari hash. Jaga
passphrase seketat kunci produksi: jangan kirim lewat chat atau email, jangan
tulis di repo. Bila passphrase bocor: ganti `BACKUP_PASSPHRASE`, rotasi
service role key (JWT secret) Supabase, API key Brevo, dan `CRON_SECRET`, lalu
minta semua user mengganti password (backup lama tetap terbuka dengan
passphrase lama).

## Membuka berkas

Dari root repo (Node 20 ke atas):

```bash
node scripts/backup/decrypt.mjs tms-backup-2026-11-20.tmsbak.txt > backup.json
```

Passphrase diketik saat diminta (tidak tampil), atau diberikan lewat env
`BACKUP_PASSPHRASE`. Jangan menulis passphrase sebagai argumen perintah (masuk
riwayat shell). Passphrase salah atau berkas diubah = `GAGAL: Passphrase salah
atau berkas rusak.` dan tidak ada keluaran.

`backup.json` berisi data pribadi, hash password, dan kunci aplikasi tanpa enkripsi: simpan di
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

### Konfigurasi database

Policy, fungsi, dan trigger sudah terpasang lagi oleh migrasi di langkah 1.
`db_config` dipakai untuk membandingkan (bila ada yang dibuat langsung di
produksi tanpa migrasi, jalankan `definition`-nya) dan untuk memasang ulang
jadwal pg_cron:

```bash
jq -r --arg q "'" '.db_config.cron_jobs[] | "select cron.schedule(" + $q + .jobname + $q + ", " + $q + .schedule + $q + ", $cmd$" + .command + "$cmd$);"' backup.json > cron.sql
```

Periksa `cron.sql` (perbarui URL di perintahnya bila domain aplikasi berubah),
lalu jalankan dengan `psql`. Berkas ini memuat `CRON_SECRET`: hapus setelah dipakai.
Berkas storage: unggah ulang isi `storage_files` (base64) ke bucket yang sama
setelah bucket dibuat dari `db_config.storage_buckets`.

### Env aplikasi

`env` berisi nilai yang dipakai produksi saat backup dibuat.

- Lokal: `jq -r '.env | to_entries[] | select(.value != null) | "\(.key)=\(.value)"' backup.json > .env.local`
  (berkas `.env*` sudah diabaikan git; jangan commit).
- Vercel: Project > Settings > Environment Variables, isi tiap nama dengan
  nilainya (Production), atau `vercel env add NAMA production` per nama, lalu
  redeploy. Tambahkan `BACKUP_PASSPHRASE` dari password manager (tidak ada di
  berkas).
- Bila memulihkan ke project Supabase **baru**, `NEXT_PUBLIC_SUPABASE_URL`,
  anon key, dan service role key diganti nilai project baru (Dashboard > Settings > API);
  nilai lama hanya berlaku untuk project lama.

## Yang TIDAK ikut backup

- **Kode aplikasi dan riwayatnya**: ada di GitHub, bukan di berkas ini.
- **Skema lengkap dalam bentuk DDL** (tabel, kolom, index, grant): dipasang dari
  `database/migrations/`. Berkas ini hanya menyimpan policy, fungsi, trigger,
  dan cron sebagai pembanding.
- **Pengaturan Supabase Auth di dashboard**: SMTP (Brevo), Site URL dan
  Redirect URL, template email, matikan signup publik, masa berlaku sesi.
  Atur ulang manual (lihat "Sesudah restore" di `docs/backup.md`).
- **Pengaturan project Supabase lain**: region, paket, extension yang
  dinyalakan lewat dashboard, event trigger milik platform, Vault.
- **Pengaturan project Vercel**: domain, region, env selain `ENV_KEYS`
  (termasuk variabel sistem), integrasi Git, proteksi deployment.
- **Akun dan token milik pemilik**: login dashboard Supabase/Vercel/GitHub,
  token CLI, token akses pribadi, Brevo akun pemilik. Simpan di password manager.
- **`BACKUP_PASSPHRASE`**: sengaja tidak ada di berkas yang ia kunci.
- **Isi storage di atas 5 MB total**: hanya daftarnya.
- **Data di luar database**: email yang sudah terkirim, log Vercel/Sentry.

Catatan: tabel dibaca satu per satu, bukan dalam satu transaksi. Perubahan
yang terjadi tepat saat backup berjalan (sekitar 02:00 WIB) bisa membuat satu
baris anak tanpa induknya; `session_replication_role = replica` mengizinkan
insert itu, lalu periksa manual.
