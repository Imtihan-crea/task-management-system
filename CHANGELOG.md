# Catatan Versi

Fitur yang ditambah atau dikurangi di aplikasi Task Management, versi terbaru di atas. Satu versi = satu pemasangan ke `kasuat-task.vercel.app`. Rincian teknis ada di `git log` dan `docs/audit-ui-rbac.md`.

## 9 Nov 2026 (versi `645695b`)

**Ditambah**
- Tombol Batalkan Task, Hapus Task, dan Hapus Workstream bekerja lagi. Sejak 8 Nov malam tombol ini tidak menyimpan apa pun.
- Overdue dihitung dengan jam WIB: task jadi Overdue mulai pukul 00.00 WIB sehari setelah Deadline, bukan pukul 07.00. Semua tanggal dan jam di aplikasi kini WIB.
- Daftar Task menampilkan semua task. Sebelumnya berhenti diam-diam di 500 task.
- Dashboard, progress project, Gantt, dan email ringkasan pagi tetap benar di atas 1000 task.
- Organizer meeting yang diganti otomatis jadi peserta, sehingga ikut menerima undangan, pengingat, dan ringkasan.
- Jumlah notifikasi belum dibaca di halaman Notifikasi selalu sama dengan lonceng.
- Workstream baru bisa dibuat walau workstream lain di project itu pernah dihapus.
- Hapus Workstream ditolak bila masih dipakai saran yang menunggu keputusan atau revisi, atau oleh task yang sudah dihapus.
- Klik ganda Submit atau Batalkan tidak mengirim email ganda.

**Dikurangi**
- Team Member tidak bisa lagi membatalkan task. Batalkan hanya untuk PM project dan Admin.
- Email ringkasan pagi tidak lagi memuat task dari project yang sudah COMPLETED atau CANCELLED.

**Menunggu pemilik**
- Membuat task baru masih bisa gagal sampai `database/migrations/017_code_no_truncate.sql` dijalankan di SQL Editor Supabase.

## 9 Nov 2026 (versi `1df7677` dan `25727ae`)

**Ditambah**
- Ganti password wajib tidak bisa dilewati dan tidak bisa memakai password lama.
- Tampilan lebih mudah dibaca: kontras dan label (pelanggaran aksesibilitas 414 menjadi 2) dan tidak meluber di HP.
- Bahasa UI diseragamkan: pesan dan tombol berbahasa Indonesia, istilah inti (Task, Project, Meeting, Workstream) tetap.
- Halaman terasa lebih cepat (waktu tanggap median 448 menjadi 346 ms).
- Subject email berbahasa Indonesia.
- Panduan pengguna (`docs/panduan-pengguna.md`).

**Dikurangi**
- Tautan "Buat Meeting" di daftar kosong tidak tampil lagi untuk Viewer.

## 8 Nov 2026

**Ditambah**
- Admin bisa membuat ulang link undangan atau link reset password untuk user.
- Isian form tidak hilang saat penyimpanan ditolak.
- Reviewer menetapkan prioritas, deadline, dan catatan saat menyetujui saran; task hasil saran mencatat asalnya.
- Create Task dari action item meeting memilih assignee dan deadline.
- Konfirmasi sebelum menghapus agenda, keputusan, action item, peserta, dan sebelum menolak saran.
- Undangan meeting dikirim saat meeting dijadwalkan, bukan saat masih DRAFT.
- Admin diperingatkan bila menonaktifkan user yang masih memegang task atau project.
- Filter Activity punya pilihan untuk meeting.

**Dikurangi**
- Project COMPLETED atau CANCELLED tidak menerima task baru dan tidak mengirim pengingat.
- User nonaktif tidak menerima notifikasi.
- Tombol yang tidak boleh dipakai disembunyikan sesuai peran (Deactivate akun sendiri, Remove organizer, Add Task untuk PM tanpa project).
- Tanggal tidak valid (mis. 30 Feb) ditolak.

## 7 Nov 2026

**Ditambah**
- Satu alamat resmi `kasuat-task.vercel.app`; alamat lama dialihkan.
- Pemantauan error: email ke admin (maksimal sekali sehari).
- Backup database mingguan otomatis, dengan salinan kedua terenkripsi di Google Drive.

**Dikurangi**
- User yang tidak ACTIVE tidak bisa membaca data apa pun lewat akses langsung ke database.

## 3–6 Nov 2026

**Ditambah**
- Admin bisa membuat user langsung dengan password (tanpa undangan), dengan opsi wajib ganti password saat login pertama.
- Halaman reset password untuk link pemulihan.

## 1–7 Okt 2026

**Ditambah**
- Login, manajemen user dan peran (Admin, Project Manager, Team Member, Viewer), undangan user.
- Project, Workstream, dan Task dengan banyak PM per project, evidence, dan email saat task Done.
- Kode mudah dibaca (project 001, workstream A, task T-01) dan pencarian berdasarkan kode.
- Saran task (suggestion) dengan alur review, notifikasi terpadu, dan dashboard per peran.
- Activity log dan paginasi daftar.
- Tampilan brand Kasuat: sidebar, lonceng notifikasi, dashboard dengan KPI, chart, dan Gantt.
- Meeting: agenda, notes, keputusan, action item, peserta, pengingat 15–30 menit sebelum mulai, email ringkasan setelah selesai, dan action item bisa dijadikan task.
- Ringkasan pagi harian lewat email.
- Status task CANCELLED, tombol Submit Done dan Batalkan, task Done dikunci, label Overdue historis.

**Dikurangi**
- Integrasi Google Calendar di pengaturan dicabut (tidak berfungsi).
