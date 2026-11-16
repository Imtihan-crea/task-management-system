/**
 * Isi halaman Update Log (/update-log): fitur yang ditambah atau dikurangi per
 * pemasangan ke produksi, terbaru di atas. Tambah satu entri di awal array
 * setiap kali deploy ke main membawa perubahan yang terasa pengguna.
 */
export type UpdateLogEntry = {
  date: string // YYYY-MM-DD (WIB), hari pemasangan
  version?: string // commit pendek di main
  title?: string
  added: string[]
  removed: string[]
  pending?: string[]
}

export const UPDATE_LOG: UpdateLogEntry[] = [
  {
    date: '2026-11-17',
    title: 'Cuti, izin & sakit',
    added: [
      'Cuti, izin, dan sakit (menu Cuti & Izin): ajukan dari aplikasi (hanya hari kerja yang dihitung), lihat status dan sisa cuti tahunan. Penyetuju (izin Setujui cuti, atau pengelola HR) menerima notifikasi, menyetujui atau menolak dengan catatan; karyawan dikabari lewat notifikasi dan email. Pengajuan sendiri harus diputuskan penyetuju lain.',
      'Rekap Daily Tracker menampilkan target serta jumlah hari cuti, izin, dan sakit; pengingat sore tidak dikirim ke yang sedang cuti. Pengaturan HR punya pilihan agar cuti mengurangi target jam (bawaan mati, seperti sheet).',
      'Data karyawan: tanda Wajib isi Daily Tracker (pengingat sore hanya untuk yang wajib).',
      'Lonceng notifikasi kini menampilkan jumlah belum dibaca dan isinya; notifikasi cuti dan Daily Tracker membuka halaman terkait. Logo Kasuat membuka Dashboard.',
      'Tampilan selebar layar dengan panel berbingkai (seperti FMS/IMS); warna tautan emas lebih jelas dibaca.',
    ],
    removed: [],
  },
  {
    date: '2026-11-16',
    added: [
      'Daily Tracker (menu Daily Tracker): setiap karyawan mencatat aktivitas kerja per jam (proyek, aktivitas, jam mulai–selesai, kategori, lokasi, output). Jam mulai otomatis menyambung dari aktivitas sebelumnya; jam yang bentrok atau lewat tengah malam ditolak. Ringkasan jam hari ini, minggu ini, dan bulan ini dibanding target 8 jam per hari kerja.',
      'Proyek, kategori, dan lokasi bisa dipilih dari daftar atau diketik sendiri bila tidak ada; isian ketikan menjadi usulan untuk dikukuhkan atasan.',
      'Master Reference (bagi pemegang izin): mengelola daftar pilihan kategori, lokasi, proyek internal, divisi, dan jabatan. Pilihan tidak bisa dihapus, hanya diarsipkan; label hanya boleh ditambah, tidak diganti.',
      'Rekap Daily Tracker (bagi pemegang izin HR): jam, efektivitas, jumlah aktivitas, hari aktif, dan status per karyawan per bulan, dengan rincian per proyek, per kategori, dan daftar aktivitas.',
      'Tab Daily Tracker di setiap project untuk PM: jam anggota di project itu dan komentar pemeriksa; karyawan mendapat notifikasi dan melihat komentarnya di Daily Tracker.',
      'Pengaturan HR: aturan jam kerja, kalender libur, dan target jam bulanan. Data karyawan (divisi, jabatan, tanggal masuk, hak cuti) di detail user. Import histori Daily Tracker dari Excel.',
      'Izin baru di Wewenang: lihat data HR, kelola data HR, kelola Master Reference (diberikan per akun), dan lihat tracker anggota project (bawaan Admin dan PM).',
      'Khusus Super Admin dan Developer di detail user: set password langsung (user wajib ganti saat login), ganti email / ID login, dan hapus akun. Akun yang dihapus tidak bisa login lagi dan hilang dari daftar, tetapi namanya tetap di riwayat task, meeting, dan activity.',
      'Wewenang per akun: Super Admin dan Developer bisa memberi atau mencabut izin tertentu untuk satu akun (di halaman detail user, bagian Wewenang), berlaku di semua project atau project tertentu. Tanpa pengaturan, izin tetap mengikuti peran seperti sebelumnya. Mengganti role user menghapus pengaturan per akun yang lama.',
      'Akun Developer (setara Super Admin untuk mengatur wewenang).',
      'Super Admin: tingkat tertinggi di atas Admin. Hanya Super Admin yang bisa mengubah, menonaktifkan, membuat link reset untuk, atau mengangkat Admin; Super Admin tidak bisa diturunkan atau dinonaktifkan. Terlihat di halaman Users.',
      'Import task dari Excel (menu Tasks, tombol Import Excel) untuk Admin dan PM. Format sama dengan file timeline harian marketing: sheet Timeline, Divisi menjadi Workstream, Nama PIC dicocokkan dengan user. Import ulang file yang diperbarui mengubah task yang sudah ada, tidak membuat dobel.',
    ],
    removed: [],
    pending: ['Pengingat sore bagi yang belum mengisi Daily Tracker sudah disiapkan tetapi belum dinyalakan.'],
  },
  {
    date: '2026-11-10',
    version: '621e387',
    added: [
      'Membuat task baru bekerja lagi. Nomor kode task tidak lagi terpotong, sehingga tidak bentrok dengan task lama (task berikutnya T-16).',
      'Halaman Update Log ini.',
      'Tombol Tandai dibaca di Notifications terkunci sebentar saat diproses, jadi tidak terklik berulang.',
    ],
    removed: [
      'Akses langsung ke database dibatasi per peran: Team Member hanya bisa membaca task miliknya dan project tempat ia punya task; PM membaca task di project yang ia kelola. Tampilan aplikasi tidak berubah.',
    ],
  },
  {
    date: '2026-11-09',
    version: '645695b',
    added: [
      'Tombol Batalkan Task, Hapus Task, dan Hapus Workstream bekerja lagi (sejak 8 Nov malam tombol ini tidak menyimpan apa pun).',
      'Overdue dihitung dengan jam WIB: task jadi Overdue mulai pukul 00.00 WIB sehari setelah Deadline. Semua tanggal dan jam di aplikasi kini WIB.',
      'Daftar Task menampilkan semua task (sebelumnya berhenti diam-diam di 500 task).',
      'Dashboard, progress project, Gantt, dan email ringkasan pagi tetap benar di atas 1000 task.',
      'Organizer Meeting yang diganti otomatis jadi peserta, sehingga ikut menerima undangan, pengingat, dan ringkasan.',
      'Jumlah notifikasi belum dibaca di halaman Notifications selalu sama dengan lonceng.',
      'Workstream baru bisa dibuat walau Workstream lain di project itu pernah dihapus.',
      'Hapus Workstream ditolak bila masih dipakai Suggestion yang menunggu keputusan atau revisi, atau oleh task yang sudah dihapus.',
      'Klik ganda Submit atau Batalkan tidak mengirim email ganda.',
    ],
    removed: [
      'Team Member tidak bisa lagi membatalkan task. Batalkan hanya untuk PM project dan Admin.',
      'Email ringkasan pagi tidak lagi memuat task dari project yang sudah COMPLETED atau CANCELLED.',
    ],
    pending: ['Membuat task baru masih bisa gagal sampai perbaikan database (migrasi 017) dijalankan.'],
  },
  {
    date: '2026-11-09',
    version: '25727ae',
    title: 'Pemasangan pagi',
    added: [
      'Ganti password wajib tidak bisa dilewati dan tidak bisa memakai password lama.',
      'Tampilan lebih mudah dibaca (kontras dan label) dan tidak meluber di HP.',
      'Bahasa UI diseragamkan: pesan dan tombol berbahasa Indonesia, istilah inti (Task, Project, Meeting, Workstream) tetap.',
      'Halaman lebih cepat (waktu tanggap median 448 menjadi 346 ms).',
      'Subject email berbahasa Indonesia.',
      'Panduan pengguna.',
    ],
    removed: ['Tautan "Buat Meeting" di daftar kosong tidak tampil lagi untuk Viewer.'],
  },
  {
    date: '2026-11-08',
    added: [
      'Admin bisa membuat ulang link undangan atau link reset password untuk user.',
      'Isian form tidak hilang saat penyimpanan ditolak.',
      'Reviewer menetapkan prioritas, deadline, dan catatan saat menyetujui Suggestion; task hasil Suggestion mencatat asalnya.',
      'Create Task dari action item Meeting memilih assignee dan deadline.',
      'Konfirmasi sebelum menghapus agenda, keputusan, action item, peserta, dan sebelum menolak Suggestion.',
      'Undangan Meeting dikirim saat Meeting dijadwalkan, bukan saat masih DRAFT.',
      'Admin diperingatkan bila menonaktifkan user yang masih memegang task atau project.',
      'Filter Activity punya pilihan untuk Meeting.',
      'Tanggal tidak valid (mis. 30 Feb) ditolak.',
    ],
    removed: [
      'Project COMPLETED atau CANCELLED tidak menerima task baru dan tidak mengirim pengingat.',
      'User nonaktif tidak menerima notifikasi.',
      'Tombol yang tidak boleh dipakai disembunyikan sesuai peran (Deactivate akun sendiri, Remove organizer, Add Task untuk PM tanpa project).',
    ],
  },
  {
    date: '2026-11-07',
    added: [
      'Satu alamat resmi kasuat-task.vercel.app; alamat lama dialihkan.',
      'Pemantauan error: email ke admin (maksimal sekali sehari).',
      'Backup database mingguan otomatis, dengan salinan kedua terenkripsi di Google Drive.',
    ],
    removed: ['User yang tidak ACTIVE tidak bisa membaca data apa pun lewat akses langsung ke database.'],
  },
  {
    date: '2026-11-06',
    title: '3–6 Nov',
    added: [
      'Admin bisa membuat user langsung dengan password (tanpa undangan), dengan opsi wajib ganti password saat login pertama.',
      'Halaman reset password untuk link pemulihan.',
    ],
    removed: [],
  },
  {
    date: '2026-10-07',
    title: 'Rilis awal (1–7 Okt)',
    added: [
      'Login, manajemen user dan role (Admin, Project Manager, Team Member, Viewer), undangan user.',
      'Project, Workstream, dan Task dengan banyak PM per project, evidence, dan email saat task Done.',
      'Kode mudah dibaca (project 001, workstream A, task T-01) dan pencarian berdasarkan kode.',
      'Task Suggestion dengan alur review, notifikasi terpadu, dan dashboard per role.',
      'Activity Log dan paginasi daftar.',
      'Tampilan brand Kasuat: sidebar, lonceng notifikasi, dashboard dengan KPI, chart, dan Gantt.',
      'Meeting: agenda, notes, keputusan, action item, peserta, pengingat 15–30 menit sebelum mulai, email ringkasan setelah selesai, action item bisa dijadikan task.',
      'Ringkasan pagi harian lewat email.',
      'Status task CANCELLED, tombol Submit Done dan Batalkan, task Done dikunci, label Overdue historis.',
    ],
    removed: ['Integrasi Google Calendar di pengaturan dicabut (tidak berfungsi).'],
  },
]
