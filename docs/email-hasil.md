# Hasil pemeriksaan template email

Tanggal: 9 Nov 2026. Alat: `npm run emails:render` (`scripts/render-emails.ts`,
menerima folder keluaran sebagai argumen; bawaan
`~/.cache/taskmgmt-smoke/fase3/emails/`, di luar repo). Skrip merender 18
template dengan data palsu (judul berisi `<script>`, `&`, dan tanda kutip)
lewat `brandEmailHtml`, lalu memeriksa escape, tautan, teks Inggris, dan
subject. Tidak ada email yang dikirim.

## Email yang dikirim aplikasi

Task ditugaskan (dari task dan dari meeting), Task BLOCKED, Task DONE, deadline
hari ini, Overdue, ditambahkan sebagai PM, Suggestion baru/direvisi,
hasil review Suggestion, undangan Meeting, Meeting diperbarui/dibatalkan,
Meeting selesai (hasil lengkap), pengingat Meeting, Meeting perlu Notes,
Brief Pagi, dan alert error server.

## Perubahan kode

- Template yang tadinya tertanam di tujuh berkas server action/cron dipindah
  ke `lib/email/templates.ts` (fungsi murni). Isi dan urutan HTML sama; tujuannya
  supaya bisa dirender dan diuji tanpa database.
- Subject berbahasa Inggris diganti: `[Meeting Completed]` menjadi
  `[Meeting Selesai]`, `[Meeting Cancelled]` menjadi `[Meeting Dibatalkan]`,
  `[Reminder]` menjadi `[Pengingat]`.
- Email Task DONE memuat kalimat penutup "Email ini dikirim otomatis..." sendiri,
  padahal layout sudah memasangnya (muncul dua kali). Kalimat itu dibuang.

## Hasil pemeriksaan

- Escape: semua data pengguna (judul, nama, project, catatan, notes, decision,
  alasan, pesan error) ter-escape di 18 template; tidak ada `<script>` mentah,
  `&` mentah, atau tanda kutip mentah di atribut.
- Tautan: semua tautan memakai `APP_URL` (di skrip: alamat resmi
  `https://kasuat-task.vercel.app`); link evidence hanya `http(s)` karena
  divalidasi saat disimpan.
- Bahasa: kalimat Indonesia, istilah inti (Task, Project, Meeting, Notes,
  Decisions, Action Items, OVERDUE, BLOCKED, DONE) tetap sesuai
  `docs/ui-bahasa.md`. Semua subject berformat `[Tag] kode judul`.

## Yang tidak diperiksa / risiko

- Tautan dibangun dari env `APP_URL`, bukan dipaksa ke alamat resmi di kode.
  Bila `APP_URL` di Vercel masih domain lama, tautan tetap jalan (dialihkan
  308) tetapi bukan alamat resmi. Nilai env produksi tidak dicek di sini.
- Email autentikasi (undangan, reset password) memakai template di dashboard
  Supabase, bukan di repo; tidak diperiksa.
- Tampilan di klien email (Gmail/Outlook) tidak diuji; hanya HTML-nya.
- Subject dan judul (`<h2>`) berisi teks yang sama, termasuk tag di kurung
  siku; dibiarkan.
