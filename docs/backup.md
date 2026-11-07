# Backup dan pemulihan database

Diperbarui: 7 Nov 2026.

## Kondisi sekarang

- Project Supabase "Task Management" memakai **plan FREE**.
- `supabase backups list` (7 Nov 2026): **tidak ada backup fisik** yang bisa
  dipulihkan (earliest/latest timestamp `0`) dan **PITR mati**.
- Artinya: bila data terhapus (salah hapus, bug, akun admin disalahgunakan),
  Supabase tidak punya salinan untuk dipulihkan. Satu-satunya pengaman adalah
  backup yang kita buat sendiri dengan cara di bawah.
- Skema (tabel, fungsi, policy) juga ada di `database/migrations/`, tetapi
  **isi data** hanya ada di database dan di backup.

## Membuat backup

Kebutuhan sekali pasang:
- Supabase CLI yang sudah login ke akun pemilik project (`supabase login`).
- `pg_dump` dan `psql` versi 17 ke atas (Arch/CachyOS: `pkexec pacman -S postgresql`;
  server PostgreSQL lokal tidak perlu dinyalakan). Docker **tidak** perlu:
  skrip memakai `supabase db dump --dry-run` lalu menjalankan pg_dump lokal.

```bash
npm run db:backup
```

Hasil di `private/backups/<YYYY-MM-DD_HHMM>/` (folder `private/` di-gitignore):

| File | Isi |
| --- | --- |
| `roles.sql` | role database |
| `schema.sql` | tabel, fungsi, trigger, policy RLS |
| `data.sql` | isi tabel schema `public` dan `auth` (format COPY) |
| `SHA256SUMS` | checksum ketiga file |

Password database tidak dibutuhkan: CLI membuat login role sementara, dan
password sementara itu hanya lewat pipe, tidak ditulis ke disk.

### Backup yang sudah diuji

7 Nov 2026 17:42 WIB, `private/backups/2026-11-07_1742/` di laptop pengembang:
checksum OK; jumlah baris di `data.sql` sama dengan database saat itu
(`auth.users` 13, `profiles` 13, `projects` 5, `tasks` 12, `activity_logs` 91,
`notifications` 105); `schema.sql` memuat 16 tabel public, 15 policy
"Only active users", dan fungsi `handle_new_user`, `is_active_user`,
`set_project_managers`.

**Isi backup adalah data pribadi** (nama, email user, isi task/meeting).
Jangan commit, jangan kirim lewat chat. Simpan salinan kedua di penyimpanan
terenkripsi milik pemilik project.

### Jadwal otomatis (laptop pengembang)

Timer systemd user di laptop pengembang menjalankan `npm run db:backup`
setiap **Senin 08:00 WIB** (`Persistent=true`: bila laptop mati, dijalankan
saat menyala berikutnya).

```bash
systemctl --user list-timers task-mgmt-backup.timer   # jadwal berikutnya
systemctl --user start task-mgmt-backup.service       # backup sekarang
journalctl --user -u task-mgmt-backup.service         # riwayat dan error
systemctl --user --failed                              # muncul di sini bila gagal
```

Unit: `~/.config/systemd/user/task-mgmt-backup.{service,timer}` (tidak di
repo, khusus laptop itu). Skrip gagal keras bila dump kosong atau terpotong
(mis. login Supabase CLI kedaluwarsa), jadi kegagalan terlihat di
`systemctl --user --failed`; folder yang gagal tertinggal dengan akhiran
`.partial` (bukan backup sah). Backup lama tidak dihapus otomatis (sekitar
170 KB per backup saat ini).

### Jadwal yang disarankan

- Sebelum setiap migrasi database atau perubahan besar.
- Minimal mingguan selama tetap di plan FREE (sudah otomatis, lihat di atas).
- Simpan beberapa backup terakhir; hapus yang lama secara manual.

## Memulihkan (restore)

Restore ke **project Supabase baru/kosong**, bukan menimpa produksi yang
masih hidup. Connection string ada di Dashboard project baru > Connect
(jangan tulis ke repo). Dari root repo:

```bash
B=private/backups/<YYYY-MM-DD_HHMM>
(cd $B && sha256sum -c SHA256SUMS)
psql "<connection string project baru>" \
  --single-transaction --variable ON_ERROR_STOP=1 \
  --file database/restore/pre-restore.sql \
  --file $B/roles.sql --file $B/schema.sql \
  --command 'SET session_replication_role = replica' \
  --file $B/data.sql \
  --command 'SET session_replication_role = origin' \
  --file database/restore/post-restore.sql
```

Kenapa ada `pre-restore.sql` dan `post-restore.sql` (ditemukan saat uji):
- Project baru memberi `anon`/`authenticated` hak penuh otomatis atas tabel
  dan fungsi baru (default privileges). Tanpa `pre-restore.sql`, hasil restore
  membiarkan user mengubah role sendiri dan RPC sensitif terbuka.
- Trigger `on_auth_user_created` di `auth.users` tidak ikut dump; dipasang
  ulang oleh `post-restore.sql`.

Sesudah restore:
1. Verifikasi ke project baru (ganti URL sementara):
   `NEXT_PUBLIC_SUPABASE_URL=https://<ref-baru>.supabase.co npm run test:rls`
   (harus 26 lulus) dan `... npm run db:status` (harus SINKRON).
2. Arahkan env Vercel (`NEXT_PUBLIC_SUPABASE_URL`, anon key, service role key)
   ke project baru, lalu redeploy.
3. Atur ulang Auth: matikan signup publik, Site URL dan Redirect URL
   (`https://kasuat-task.vercel.app`), SMTP Brevo, dan pg_cron
   `meeting-reminders` (lihat `docs/completion-report-phase11-meetings.md`).

User Supabase Auth (`auth.users`, `auth.identities`, termasuk hash password)
ikut di `data.sql`, jadi login lama tetap berlaku. Data Supabase Storage
tidak dibackup: aplikasi tidak memakainya, dan tabel internal storage menolak
restore. Backup sebelum 7 Nov 2026 18:51 masih memuat tabel storage dan
gagal direstore apa adanya; pakai backup yang lebih baru.

### Uji restore

7 Nov 2026 18:53 WIB: backup `2026-11-07_1851` direstore ke project percobaan
baru (dihapus lagi sesudahnya) dengan perintah di atas. Hasil: `psql` exit 0;
jumlah baris semua tabel public + `auth.users`/`auth.identities` identik
dengan produksi (sidik jari md5 sama); ACL tabel/fungsi/kolom, default
privileges, dan trigger identik (38 item); `npm run test:rls` 26/26 lulus;
`npm run db:status` SINKRON. Uji pertama tanpa pre/post gagal 5 cek RLS.
Belum diuji: login lewat aplikasi ke project hasil restore.

## Alternatif: upgrade plan

Plan berbayar Supabase menyediakan backup harian otomatis dan opsi PITR
(cek harga dan masa simpan terbaru di halaman pricing Supabase).
Keputusan biaya ada di pemilik project.
