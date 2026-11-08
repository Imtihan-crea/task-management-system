# Panduan Pengguna Task Management System

Panduan ini untuk staf kantor yang memakai aplikasi sehari-hari. Alamat aplikasi: https://kasuat-task.vercel.app/login

Nama menu, tombol, dan pesan ditulis persis seperti yang tampil di layar. Istilah inti (Task, Project, Workstream, Suggestion, Meeting, Evidence, Overdue, dan nama status seperti TODO atau DONE) memang tetap berbahasa Inggris, sesuai `docs/ui-bahasa.md`.

## 1. Apa itu aplikasi ini

Task Management System adalah tempat tim mengatur pekerjaan:

- **Project**: pekerjaan besar yang punya satu atau lebih Project Manager (PM). Di dalamnya ada **Workstream**, yaitu pengelompokan pekerjaan (kodenya huruf A, B, C, ...).
- **Task**: satu pekerjaan dengan penanggung jawab (**Assignee**), **Deadline**, dan prioritas. Kode task berbentuk `T-01`.
- **Suggestion**: usulan task dari anggota tim yang ditinjau PM sebelum menjadi task resmi. Kode `S-001`.
- **Meeting**: rapat beserta agenda, catatan, keputusan, dan tindak lanjut. Kode `M-001`.
- **Notifications** dan email pengingat, serta **Activity Log** yang mencatat siapa mengubah apa.

Menu di sisi kiri: Dashboard; Projects, Workstreams, Tasks; Meetings, Task Suggestions; Activity Log; Users (hanya Admin); Pengaturan. Menu yang tidak boleh Anda pakai tidak ditampilkan. Di bagian atas ada kolom pencarian, lonceng Notifications, dan menu profil (Lihat Profil, Ubah Profil, Preferensi Notifikasi, Pengaturan Akun, Logout).

## 2. Role dan hak akses

Setiap akun punya satu role yang diatur Admin. Tabel di bawah meringkas aturan di `lib/auth/permissions.ts`, `lib/auth/task-access.ts`, `lib/auth/project-access.ts`, dan `lib/meetings/rules.ts`.

| Kegiatan | Admin | Project Manager (PM) | Team Member | Viewer |
| --- | :---: | :---: | :---: | :---: |
| Melihat Dashboard, Projects, Tasks, Activity Log | ya | ya | ya | ya |
| Mengelola Users (undang, buat, ubah role, aktif/nonaktif) | ya | tidak | tidak | tidak |
| Membuat Project | ya | ya | tidak | tidak |
| Mengubah Project dan Workstream | semua | hanya Project yang ia kelola | tidak | tidak |
| Membuat, mengubah, menghapus Task | semua | hanya di Project yang ia kelola | tidak | tidak |
| Mengubah status, Submit, Batalkan Task, mengisi Evidence | semua Task | Task di Project yang ia kelola, dan Task yang ditugaskan kepadanya | hanya Task miliknya | tidak |
| Membuka kembali Task yang DONE atau CANCELLED | ya | ya (Project yang ia kelola) | tidak | tidak |
| Mengusulkan Task (Suggestion) | semua Project | Project yang ia kelola | Project yang ia punya Task di dalamnya | tidak |
| Meninjau Suggestion (Setujui, Minta Revisi, Tolak) | semua | Project yang ia kelola | tidak | tidak |
| Membuat Meeting | ya | ya | ya | tidak |
| Menjadwalkan, menyelesaikan, membatalkan, mengubah Meeting | semua | Meeting Project yang ia kelola, atau Meeting yang ia ikuti/adakan | hanya Meeting yang ia adakan (organizer) | tidak |
| Mengisi Notes, Agenda, Decision, Action Item | semua | ya (dalam lingkup di atas) | ya, bila peserta Meeting | tidak |
| Mengubah nama sendiri, preferensi email | ya | ya | ya | ya |

Yang perlu diketahui:

- **Team Member** hanya melihat Task miliknya di daftar `/tasks` dan Project yang ia ikuti.
- **PM** melihat di `/tasks` Task Project yang ia kelola dan Task yang ditugaskan kepadanya. PM yang menjadi Assignee di Project PM lain boleh mengerjakan Task-nya sendiri (status, Submit, Evidence), tetapi tidak boleh mengubah atau menghapusnya.
- **Viewer** hanya membaca. Viewer tidak bisa mengusulkan Task atau membuat Meeting.
- Meeting hanya terlihat oleh Admin, pembuat, organizer, peserta, dan PM Project terkait.
- Bila Anda membuka halaman yang tidak diizinkan, Anda dikembalikan ke Dashboard. Bila aksi ditolak, muncul pesan "Anda tidak punya izin untuk melakukan aksi ini."

## 3. Masuk (Login), ganti password, lupa password

**Login.** Buka halaman Login, isi Email dan Password, lalu klik **LOGIN**. Pesan yang mungkin muncul:

| Pesan | Artinya |
| --- | --- |
| Email atau Password salah. | Email atau Password keliru. Pesannya sengaja sama untuk keduanya. |
| Akun Anda nonaktif. Silakan hubungi administrator. | Akun berstatus INACTIVE. Hubungi Admin. |
| Undangan akun Anda belum selesai diproses. | Akun berstatus INVITED: Anda belum membuat password lewat link undangan. |

**Menerima undangan.** Admin dapat mengirim email undangan atau mengirimkan Link undangan lewat WhatsApp/chat. Buka Link itu, isi password (minimal 8 karakter) dan ulangi, lalu klik **Atur Password & Aktifkan**. Akun menjadi ACTIVE dan Anda masuk ke Dashboard. Link hanya bisa dipakai satu kali; bila muncul "Link undangan ini sudah dipakai atau kedaluwarsa. Minta administrator Anda mengirim undangan baru.", minta Admin membuat Link baru.

**Login pertama dengan password sementara.** Bila Admin membuat akun Anda dengan password sementara dan mencentang "Wajib ganti Password saat Login pertama", setelah Login Anda dibawa ke halaman **Ubah Password**. Isi Password Baru dan Konfirmasi Password Baru (minimal 8 karakter, harus berbeda dari password sementara), lalu klik **Simpan Password Baru**. Sesudahnya Anda diminta masuk lagi dengan password baru ("Password sudah diubah. Masuk dengan password baru."). Selama belum mengganti password, Anda tidak bisa memakai aplikasi. Tombol Logout tersedia di halaman itu.

**Lupa password.** Saat ini belum ada tombol "Lupa password" di halaman Login. Minta Admin membuat **Link reset Password** untuk Anda (lihat bagian 4). Buka Link itu, isi password baru dua kali, lalu klik **Simpan Password Baru**. Link hanya berlaku sekali; bila "Link reset Password ini sudah dipakai atau kedaluwarsa. Minta yang baru dari administrator Anda.", minta Link baru.

## 4. Untuk Admin: mengelola user

Menu **Users** hanya untuk Admin. Di halaman itu ada pencarian ("Cari nama atau email"), filter Role dan Status, dan tombol **+ Tambah User**.

**Dua cara menambah user**

1. **Undang User**: isi Nama Lengkap, Email, dan Role, lalu klik **Kirim Undangan**. User berstatus INVITED sampai ia membuat password. Bila email tidak bisa terkirim (kuota email gratis terbatas), aplikasi tetap membuat user dan menampilkan kotak "Kirim link ini ke user" berisi Link sekali pakai. Klik **Salin**, lalu kirim lewat WhatsApp atau chat.
2. **Buat User dengan Password**: isi Nama Lengkap, Email, Password (minimal 6 karakter), dan Role. Tanpa email apa pun, user langsung ACTIVE. Centang **Wajib ganti Password saat Login pertama** agar user mengganti password sementara itu. Bagikan password lewat kanal yang aman, jangan lewat tempat yang bisa dibaca orang lain.

Pesan yang mungkin muncul: "User dengan Email ini sudah ada." dan "Email ini masih terdaftar di Supabase Auth. ..." (user pernah dihapus dari tabel profil tetapi belum dari Supabase Auth; hapus dulu di Supabase Dashboard).

**Link undangan baru atau Link reset Password.** Di halaman detail user (**Ubah User**) ada tombol pembuat Link:

- user INVITED: tombol **Link undangan baru** (Link lama tidak berlaku lagi);
- user ACTIVE: tombol **Link reset Password**.

Link muncul di kotak "Link sekali pakai"; salin dan kirim ke user. User INACTIVE harus diaktifkan dulu ("Aktifkan user terlebih dahulu.").

**Mengubah role dan status.** Di halaman **Ubah User** Anda dapat mengubah Nama Lengkap, Role, dan Status, lalu klik **Simpan Perubahan**. Di daftar dan detail user ada juga tombol cepat **Aktifkan** / **Nonaktifkan**. Aturannya:

- Anda tidak dapat mengubah status Anda sendiri, dan tidak dapat menonaktifkan akun Anda sendiri.
- Minimal satu Admin aktif harus tetap ada ("Minimal satu administrator aktif harus tetap ada.").
- User INVITED tidak bisa diaktifkan dari sini ("User ini belum menerima undangan."); ia menjadi ACTIVE sendiri setelah membuat password.
- Status INVITED tidak bisa dipilih manual.

**Apa yang terjadi saat user dinonaktifkan.** Ia langsung tidak bisa Login, dan sesi yang sedang terbuka ditolak. Notifications dan email hanya dikirim ke user ACTIVE. Task yang masih dipegangnya **tidak dipindahkan otomatis**, begitu juga jabatan PM-nya. Setelah menonaktifkan, aplikasi menampilkan peringatan, misalnya "Masih memiliki 3 task terbuka dan PM di 1 Project: silakan tetapkan ulang." Tugas Admin berikutnya: ubah Assignee Task itu dan tetapkan PM pengganti di Project terkait (tab Pengaturan). Mengaktifkan kembali user memulihkan aksesnya.

## 5. Project dan Workstream

**Project** (menu Projects). Admin dan PM membuat Project lewat **+ Tambah Project**: isi nama, client (opsional), deskripsi, tanggal mulai dan deadline, status, dan minimal satu Project Manager ("Minimal satu Project Manager wajib dipilih."). Daftar Project bisa dicari dengan kode, nama, atau client. Status Project: PLANNING, ACTIVE, ON HOLD, COMPLETED, CANCELLED.

Halaman Project punya tab **Ringkasan, Workstreams, Tasks, Meetings, Activity, Anggota, Pengaturan**. Tab Pengaturan (Admin dan PM Project itu) dipakai untuk mengubah data Project dan daftar PM. Anda tidak bisa melepas diri sendiri sebagai PM ("Anda tidak dapat menghapus diri sendiri sebagai Project Manager. Minta Admin."). PM harus berstatus ACTIVE dan ber-role Admin atau PM.

Project berstatus **COMPLETED** atau **CANCELLED** menolak Task atau Suggestion baru: "Project ini COMPLETED atau CANCELLED. Buka kembali untuk menambah task baru." Ubah status Project di tab Pengaturan untuk membukanya lagi.

**Workstream.** Dibuat di tab Workstreams pada Project (**Buat Workstream**, isi nama dan deskripsi). Menu Workstreams hanya daftar semua Workstream; pembuatannya selalu di dalam Project. Workstream baru otomatis mendapat huruf berikutnya. Workstream yang masih punya Task tidak bisa dihapus: "Workstream ini masih memiliki task dan tidak dapat dihapus. Pindahkan task terlebih dahulu."

## 6. Siklus hidup Task

Admin dan PM membuat Task lewat **+ Tambah Task**, lalu mengisi Nama Task, Project, Workstream (opsional), Assignee, Prioritas (LOW, MEDIUM, HIGH), Status, Tanggal Mulai, dan Deadline (wajib). Assignee harus user ACTIVE. Assignee mendapat Notifications dan email penugasan.

**Status**: `TODO`, `IN PROGRESS`, `REVIEW`, `BLOCKED` (task masih terbuka), lalu `DONE` atau `CANCELLED` (task tertutup). Alur umumnya:

```
TODO -> IN PROGRESS -> REVIEW -> DONE
              \-> BLOCKED (terhambat; kembali ke status terbuka lain bila hambatan selesai)
Task terbuka mana pun -> CANCELLED (tombol Batalkan Task)
```

- **Mengubah status terbuka**: di halaman detail Task, pilih status lalu klik **Perbarui**. Dropdown hanya berisi status terbuka. Task baru tidak bisa dibuat langsung DONE atau CANCELLED.
- **Menyelesaikan**: klik **Submit sebagai Done**. Waktu submit tercatat ("Tanggal Submit") dan email pemberitahuan DONE dikirim. Mengklik Submit dua kali tidak mengirim email dua kali.
- **Membatalkan**: klik **Batalkan Task**, lalu konfirmasi. Waktunya tercatat ("Tanggal Dibatalkan"). Task DONE tidak bisa dibatalkan langsung; buka kembali dulu.
- **Task terkunci**: Task DONE atau CANCELLED tidak bisa diubah statusnya oleh Assignee. Tampil "Task ini terkunci. Minta PM atau Admin untuk mengubahnya."
- **Membuka kembali (reopen)**: PM Project atau Admin membuka formulir **Ubah Task** dan memilih status terbuka (mis. TODO), lalu **Simpan Perubahan**. Tanggal submit/batal dihapus. Untuk task DONE atau CANCELLED, pilihan awal dropdown bertuliskan "(tidak diubah)"; selama itu yang terpilih, menyimpan hanya mengubah isian lain dan task tetap tertutup. Hati-hati: memilih status terbuka berarti membuka ulang task.
- **Evidence**: bagian "Evidence" di detail Task menyimpan satu Link bukti pekerjaan (harus diawali `http://` atau `https://`). Ketuk **Simpan**. Evidence boleh diubah juga setelah Task DONE oleh orang yang berhak bertindak atas task itu. Pesan bila salah: "Evidence harus berupa Link valid yang diawali http(s)://."
- **Hapus Task** (**Hapus Task**, Admin dan PM Project): task disembunyikan dari daftar.

**Overdue.** Task disebut **Overdue** bila Deadline sudah lewat dan statusnya belum DONE atau CANCELLED. Task tertutup tidak pernah dihitung Overdue di daftar dan KPI. Badge Overdue pada task DONE hanya tampil bila Deadline lebih awal daripada tanggal submit. Penting: pergantian hari dihitung dalam **UTC**, bukan WIB. Task dengan Deadline 10 Nov baru berstatus Overdue mulai 11 Nov pukul **07.00 WIB** (tengah malam UTC), bukan pukul 00.00 WIB. Pengingat email "deadline hari ini" dan "Overdue" juga dikirim sekali sehari sekitar pukul 07.00 WIB.

**Daftar Task.** Tab: Semua, Task Saya, Berjalan, To Do, Blocked, Done, Cancelled, Overdue. Admin dan PM juga punya filter Project, Assignee, Status, Prioritas, dan "Jatuh tempo minggu ini", plus urutan (Deadline, Prioritas, Dibuat, Diperbarui).

## 7. Alur Suggestion (usulan Task)

Suggestion dipakai bila Anda melihat pekerjaan yang perlu dibuat tetapi tidak berhak membuat Task langsung.

1. **Mengusulkan.** Klik **Usulkan Task** (di Tasks atau di halaman Project) atau buka menu Task Suggestions. Isi judul, deskripsi (wajib), Project (wajib), serta Workstream, Assignee, prioritas, dan Deadline yang disarankan (opsional). Klik **Submit Suggestion**. Admin boleh mengusulkan untuk semua Project, PM untuk Project yang ia kelola, Team Member untuk Project tempat ia punya Task. Status awal: `PENDING`. PM Project mendapat Notifications.
2. **Meninjau.** Admin atau PM Project membuka Suggestion, bagian **Review Suggestion**, dan memilih:
   - **Setujui**: Assignee harus dipilih (aktif) dan Deadline harus ada (diisi pengusul atau reviewer). Reviewer boleh mengubah prioritas, Deadline, dan Assignee. Hasilnya **satu Task resmi** berstatus TODO, tertaut ke Suggestion itu ("Source" di detail Task). Status Suggestion menjadi `CONVERTED`. Pesan: "Disetujui. Task T-xx berhasil dibuat." Assignee mendapat Notifications dan email penugasan.
   - **Minta Revisi**: Catatan review wajib ("Catatan review wajib diisi untuk keputusan ini."). Status menjadi `REVISION_REQUESTED`.
   - **Tolak**: Catatan wajib juga. Status `REJECTED`, tidak bisa dibatalkan.
3. **Memperbaiki.** Hanya pengusul yang bisa melakukannya, saat statusnya `REVISION_REQUESTED`: buka Suggestion, ubah isian, klik **Perbaiki & Submit Ulang**. Status kembali `PENDING`.

Hanya Suggestion `PENDING` yang bisa ditinjau. Riwayat dan catatan review tampil di "Riwayat Review". Daftar Task Suggestions punya tab "Suggestion Saya" dan pencarian ("Kode (S-001), judul, project").

## 8. Alur Meeting

Status Meeting: `DRAFT` -> `SCHEDULED` -> `COMPLETED`, atau `CANCELLED`.

1. **Membuat** (**+ Buat Meeting**): isi judul, tipe (mis. Internal Meeting atau Client Meeting), tanggal dan jam, lokasi atau Link Meeting (harus diawali http(s)://), Project (opsional; kosong berarti Meeting global), organizer, dan peserta. Meeting baru berstatus **DRAFT** dan **belum mengirim undangan**. Team Member hanya bisa menjadi organizer Meeting-nya sendiri.
2. **Menyiapkan.** Di halaman detail Meeting ada tab Ringkasan, Agenda, Notes, Decisions, Action Items, dan Activity. Tambah **Agenda** (urutan bisa diatur), tambah peserta dari daftar "User Kasuat", dan ubah Meeting lewat **Ubah Meeting**.
3. **Jadwalkan Meeting.** Klik **Jadwalkan Meeting** (hanya dari DRAFT). Status menjadi `SCHEDULED` dan **undangan dikirim** ke semua peserta (Notifications dan email "[Undangan Meeting]"). Perubahan pada DRAFT tidak menotifikasi siapa pun. Peserta mengisi Kehadiran (PENDING, ACCEPTED, DECLINED, ATTENDED).
4. **Pengingat.** Peserta mendapat pengingat sekitar 15 menit sebelum mulai. Sesudah Meeting lewat tanpa Notes, ada satu pengingat "Meeting perlu Notes".
5. **Selama dan sesudah rapat.** Isi **Notes** (**Simpan Notes**), catat **Decision** (dengan alasan, opsional), dan tambah **Action Item** (judul, Assignee, Deadline, Prioritas, status OPEN/IN_PROGRESS/DONE/DROPPED).
6. **Action Item menjadi Task.** Pada Action Item klik **Buat Task**: pilih Project (bila Meeting tidak punya Project), Assignee, Deadline, dan Workstream. Task dibuat sekali saja per Action Item; setelahnya tampil kode Task-nya. Action Item yang sudah punya Task tidak bisa dihapus. PM hanya bisa membuat Task di Project yang ia kelola, dan tidak bisa pada Meeting CANCELLED.
7. **Selesaikan.** Klik **Selesaikan Meeting** (hanya dari SCHEDULED). Kotak "Sebelum menyelesaikan meeting" menampilkan jumlah Action Item, Task yang sudah dibuat, dan Task siap dibuat. Semua peserta menerima email ringkasan hasil (Notes, Decision, Action Item). Meeting `COMPLETED` tanpa Notes muncul di tab **Perlu Notes**.
8. **Batalkan.** **Batalkan Meeting** hanya dari DRAFT atau SCHEDULED. Peserta diberi tahu bila Meeting sudah SCHEDULED. Meeting COMPLETED atau CANCELLED tidak bisa diubah lagi, dan Meeting CANCELLED mengunci Notes, Agenda, Decision, dan Action Item.

Daftar Meetings punya tab Semua, Mendatang, Hari Ini, Perlu Notes, Completed. Jam Meeting memakai waktu Jakarta (WIB).

## 9. Notifications dan preferensi email

- **In-app.** Lonceng di bagian atas menampilkan Notifications terbaru; halaman **Notifications** menampilkan semuanya. Klik **Tandai dibaca** per item atau **Tandai semua dibaca**. Notifikasi dalam aplikasi selalu muncul.
- **Yang memicu notifikasi**: Task ditugaskan, status Task berubah (BLOCKED, DONE, CANCELLED), deadline hari ini dan Overdue, Suggestion baru dan hasil review, ditambahkan sebagai PM, serta undangan, perubahan, pembatalan, penyelesaian, dan pengingat Meeting. Satu kejadian tidak diberitahukan dua kali.
- **Email.** Buka **Pengaturan** (atau Preferensi Notifikasi di menu profil), bagian **Preferensi Email**, lalu klik **Simpan Preferensi**. Pilihannya: Notifications Email (sakelar utama), Penugasan Task & Done, Pembaruan Suggestion, Pengingat Deadline, Undangan, Pembaruan & Pengingat Meeting, dan Ringkasan Pagi Harian. Mematikan sakelar utama menghentikan semua email, tetapi tidak notifikasi dalam aplikasi. Bila belum pernah menyimpan, semuanya aktif.
- **Ringkasan Pagi Harian** dikirim bersama pengingat deadline sekitar pukul 07.00 WIB.

## 10. Activity Log

Menu **Activity Log** mencatat kejadian penting (membuat dan mengubah Task, Project, Workstream, Suggestion, user, dan Meeting). Setiap catatan berisi siapa, apa, dan kapan. Filter: Entitas (Tasks, Projects, Workstreams, Suggestions, Users), Aksi, Pelaku (nama user), tanggal Dari dan Sampai, serta Project. Daftar bisa berpindah halaman. Isi yang terlihat mengikuti hak akses: Anda melihat aktivitas Anda sendiri dan yang berhubungan dengan Project, Task, Suggestion, dan Meeting yang berhak Anda lihat; Admin melihat semuanya. Catatan tidak bisa diubah atau dihapus. Password tidak pernah dicatat. Riwayat per Task juga ada di bagian "Activity" pada detail Task.

## 11. FAQ dan pemecahan masalah

| Yang Anda lihat | Penyebab dan yang perlu dilakukan |
| --- | --- |
| Anda tidak punya izin untuk melakukan aksi ini. | Role atau keterlibatan Anda tidak mencukupi untuk aksi itu (mis. Team Member mengubah Task orang lain, PM di luar Project-nya). Minta PM Project atau Admin. |
| Dikembalikan ke Dashboard saat membuka halaman | Halaman itu tidak untuk role Anda (mis. Users hanya Admin). |
| Halaman Task/Meeting menampilkan "tidak ditemukan" | Item dihapus, atau di luar hak lihat Anda (Meeting hanya terlihat oleh yang terlibat). |
| Task ini terkunci. Minta PM atau Admin untuk membukanya kembali. | Task sudah DONE atau CANCELLED. PM atau Admin membukanya lewat **Ubah Task**. |
| Gunakan tombol Submit / Batalkan di bawah untuk menutup task. | DONE dan CANCELLED tidak bisa dipilih di dropdown status; pakai **Submit sebagai Done** atau **Batalkan Task**. |
| Task yang sudah Done tidak dapat dibatalkan. ... | Buka kembali dulu (PM/Admin), baru batalkan. |
| Assignee harus berupa user aktif. | Pilih user berstatus ACTIVE. Assignee lama yang sudah nonaktif boleh tetap, tetapi yang baru harus aktif. |
| Workstream bukan milik Project ini. | Pilih Workstream dari Project yang sama, atau kosongkan. |
| Deadline harus setelah tanggal mulai. | Perbaiki tanggal. Isian Anda tidak hilang. |
| Project ini COMPLETED atau CANCELLED. Buka kembali untuk menambah task baru. | Ubah status Project di tab Pengaturan. |
| Catatan review wajib diisi untuk keputusan ini. | Isi alasan untuk Minta Revisi atau Tolak. |
| Pilih Assignee untuk menyetujui Suggestion ini. / Tetapkan Deadline untuk menyetujui Suggestion ini. | Lengkapi di formulir **Review Suggestion**. |
| Hanya Meeting DRAFT yang dapat dijadwalkan. / Hanya Meeting SCHEDULED yang dapat diselesaikan. | Status Meeting tidak sesuai tombol yang ditekan; muat ulang halaman. |
| Meeting yang COMPLETED atau CANCELLED tidak dapat diubah. | Meeting sudah menjadi catatan akhir. |
| Organizer tidak dapat dihapus. Ubah Organizer terlebih dahulu. | Ganti organizer di **Ubah Meeting** sebelum menghapus peserta itu. |
| Link undangan / Link reset Password sudah dipakai atau kedaluwarsa | Link hanya berlaku satu kali. Minta Admin membuat Link baru (bagian 4). |
| Terlalu banyak percobaan. Tunggu semenit lalu coba lagi. | Batas percobaan ganti password. Tunggu sebentar. |
| Password ini terlalu mudah ditebak. Pilih Password yang lebih kuat. | Pilih password lain. |
| Password baru harus berbeda dari password saat ini. | Jangan mengulang password sementara. |
| Sesi Anda telah berakhir. Silakan Login kembali. | Login ulang. |
| Terjadi kesalahan. Silakan coba lagi. | Gangguan sementara. Coba lagi; bila berulang, kabari Admin dengan waktu kejadian dan halaman yang dibuka. |
| Email tidak masuk | Periksa folder spam dan Preferensi Email. Email undangan dari sistem bisa tertahan batas kuota; Admin dapat memakai Link. Notifikasi dalam aplikasi tetap muncul. |
| Task saya tiba-tiba Overdue di pagi hari | Pergantian hari dihitung pada pukul 07.00 WIB (bagian 6). |
| Tidak bisa Login padahal password benar | Akun mungkin INACTIVE atau INVITED; hubungi Admin. |

Untuk keperluan yang tidak ada di sini, hubungi Admin aplikasi.
