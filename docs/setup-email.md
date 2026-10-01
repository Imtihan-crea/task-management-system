# Setup Email (SMTP) - Supaya Kuota Email Cukup

Masalah: Supabase built-in SMTP hanya bisa kirim **2 email per jam**, dan hanya
ke email anggota tim project. Untuk Task Management yang nanti butuh notifikasi,
kuota ini tidak cukup.

Solusi: pasang SMTP sendiri di Supabase.

---

## Kenapa perlu sekarang

Nilai实习nya jelas:

| | Kuota | Bisa kirim ke |
|---|---|---|
| Supabase built-in | 2 / jam | Hanya anggota tim project |
| + Custom SMTP | 30 / jam (bisa dinaikkan) | anyone |

Nilai 30/jam bisa dinaikkan di **Authentication > Rate Limits** setelah SMTP aktif.

Untuk notifikasi Task Management, kuota 30/jam masih bisa habis kalau banyak
user aktif. Naikkan ke angka yang kamu butuhkan setelah selesai setup.

---

## Pilihan provider

| Provider | Gratis | Perlu domain sendiri | Catatan |
|---|---|---|---|
| **Brevo** | 300 email/hari | Tidak wajib | **Paling mudah**, SMTP langsung tanpa setup DNS |
| Resend | 3000 email/bulan | **Wajib** | Perlu domain + ubah DNS |
| AWS SES | Murah | Tidak wajib | Agak lebih banyak setup |
| SendGrid | 100/hari | Tidak wajib | Perlu verifikasi pengirim |

Rekomendasi sekarang: **Brevo**, karena belum punya domain dan tidak perlu
mengubah DNS sama sekali.

Kalau nanti punya domain (misal `tms-perusahaan.co.id`), pindah ke Resend
karena kuartanya jauh lebih besar dan reputasi pengirim lebih baik.

---

## Setup dengan Brevo (10 menit)

### 1. Daftar Brevo

1. Buka `https://brevo.com` -> **Sign up** (gratis, pakai email kerja)
2. Verifikasi email kamu
3. Dari dashboard, buka menu **SMTP & API**

### 2. Buat pengirim (Sender)

1. Brevo -> **Senders & Domains** -> **Add a new sender**
2. Isi:
   - **Sender name**: `Task Management System`
   - **Email**: pakai email kamu sendiri dulu, misal `imtihanam@gmail.com`
3. Klik **Save**, lalu **Verify** email tersebut (klik link yang dikirim Brevo)

> Untuk production, ganti dengan domain sendiri kalau sudah punya.
> Sementara ini email pengirim `gmail` sudah cukup untuk testing.

### 3. Ambil kredensial SMTP

Di Brevo -> **SMTP & API**:

| Field | Nilai |
|---|---|
| Server | `smtp-relay.brevo.com` |
| Port | `587` |
| Login | HarUS pakai format `LOGIN:xxxxxbrevo` (dari halaman SMTP & API) |
| Password | SMTP key dari halaman **SMTP & API** |

> Login bukan email biasa.Copy-paste langsung dari halaman **SMTP & API** di Brevo.

### 4. Pasang di Supabase

1. Supabase -> project kamu -> **Authentication** -> **Email** -> **SMTP Settings**
2. Isi:

| Field | Nilai |
|---|---|
| Enable Custom SMTP | **ON** |
| SMTP Host | `smtp-relay.brevo.com` |
| SMTP Port | `587` |
| SMTP User | dari Brevo (format `LOGIN:xxxxxbrevo`) |
| SMTP Pass | SMTP key dari Brevo |
| **Sender email** | `imtihanam@gmail.com` (sudah diverifikasi di Brevo) |
| Sender name | `Task Management System` |

3. Klik **Save**

### 5. Naikkan rate limit

Supabase -> **Authentication** -> **Rate Limits**

Cari **Email** -> ubah dari `2` ke `30` (atau lebih sesuai kebutuhan).

---

## Test

1. Dari `/users` -> **Invite User** dengan email **yang berbeda** dari email yang
   kamu pakai login (Supabase built-in hanya bisa kirim ke anggota tim)
2. Cek inbox email tersebut
3. Kalau masuk -> SMTP berhasil
4. Buka link -> harus muncul form set password -> login berhasil

Kalau gagal, cek:
- **Vercel > Logs** -> cari `[invite] Supabase error:` untuk pesan detail
- Brevo -> **SMTP & API** -> lihat log pengiriman

---

## Untuk notifikasi Phase 6 nanti

SMTP Supabase ini khusus email **Autentikasi** (undangan, reset password).

Kalau nanti butuh email notifikasi Task Management (task ditugaskan, deadline
dekat, dll), itu **tidak** lewat Supabase. Aplikasi akan kirim sendiri memakai
API dari provider yang sama, misal lewat Edge Function + Brevo API.

Bedanya penting:
- **SMTP Supabase** = email login/undangan. Dikelola lewat dashboard Supabase.
- **Brevo API** = email notifikasi aplikasi. Dikelola dari kode kita.

---

## Catatan biaya

Brevo gratis 300 email/hari. Kalau habis, akun di-pause sampai reset hari
berikutnya. Untuk tim internal dengan Task Management, 300/hari normally
sangat cukup. Kalau ternyata kurang, baru naik ke paket berbayar (~$9/bulan
untuk 20.000 email).
