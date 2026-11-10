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
      'Halaman Update Log ini.',
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
