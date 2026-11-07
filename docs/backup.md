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
| `data.sql` | seluruh isi tabel (format COPY) |
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
(jangan tulis ke repo).

```bash
cd private/backups/<YYYY-MM-DD_HHMM>
sha256sum -c SHA256SUMS
psql --single-transaction --variable ON_ERROR_STOP=1 \
  --file roles.sql --file schema.sql \
  --command 'SET session_replication_role = replica' \
  --file data.sql \
  --dbname "<connection string project baru>"
```

Sesudah restore:
1. Arahkan env Vercel (`NEXT_PUBLIC_SUPABASE_URL`, anon key, service role key)
   ke project baru, lalu redeploy.
2. Atur ulang Auth: matikan signup publik, Site URL dan Redirect URL
   (`https://kasuat-task.vercel.app`), SMTP Brevo, dan pg_cron
   `meeting-reminders` (lihat `docs/completion-report-phase11-meetings.md`).
3. Jalankan `npm run db:status` dan `npm run test:rls` ke project baru.

User Supabase Auth (`auth.users`, `auth.identities`) ikut di `data.sql`
(terverifikasi pada backup 7 Nov 2026), jadi login dan password lama
seharusnya tetap berlaku setelah restore.

**Restore belum pernah diuji** (butuh project Supabase kosong). Uji sekali di
project percobaan sebelum benar-benar membutuhkannya.

## Alternatif: upgrade plan

Plan berbayar Supabase menyediakan backup harian otomatis dan opsi PITR
(cek harga dan masa simpan terbaru di halaman pricing Supabase).
Keputusan biaya ada di pemilik project.
