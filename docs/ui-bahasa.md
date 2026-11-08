# Aturan bahasa UI

Keputusan pemilik (9 Nov 2026): **campur dengan aturan**. Kalimat, label,
tombol, judul halaman, placeholder, teks bantuan, pesan error/sukses, dan
email memakai **bahasa Indonesia**. **Istilah inti tetap bahasa Inggris**
supaya pengguna yang sudah terbiasa tidak bingung, dan nilai di database,
filter, serta URL tidak berubah.

## Istilah inti (jangan diterjemahkan)

| Istilah | Catatan |
| --- | --- |
| Task, Project, Meeting, Workstream, Suggestion | nama modul; boleh huruf kecil di tengah kalimat ("judul task") |
| Agenda, Notes, Decision, Action Item, Evidence | bagian meeting/task |
| Dashboard, Activity, Notifications | nama menu |
| Admin, Project Manager (PM), Team Member, Viewer | nama role (`ROLE_LABELS`) |
| TODO, IN PROGRESS, REVIEW, BLOCKED, DONE, CANCELLED, DRAFT, SCHEDULED, COMPLETED, PENDING, PLANNING, ACTIVE, ON HOLD, INVITED, INACTIVE | nilai status dan label tampilannya |
| LOW, MEDIUM, HIGH | prioritas |
| Overdue, Deadline, Assignee, Organizer | istilah kerja yang sudah umum |
| Email, Password, Link, Login, Logout | istilah umum |

Kode task/meeting (`T-01`, `M-003`) dan nama tab di URL (`?tab=notes`)
tidak berubah.

## Terjemahan baku

| Inggris | Indonesia |
| --- | --- |
| Create / Add / New X | Buat X / Tambah X |
| Save / Save Changes | Simpan / Simpan Perubahan |
| Saving... / Creating... / Sending... | Menyimpan... / Membuat... / Mengirim... |
| Edit X | Ubah X |
| Delete / Remove | Hapus |
| Cancel (aksi membatalkan) | Batalkan |
| Back to X | Kembali ke X |
| Search | Cari |
| Filter / Reset | Filter / Reset |
| Full Name | Nama Lengkap |
| Title / Description | Judul / Deskripsi |
| Start Date / End Date | Tanggal Mulai / Tanggal Selesai |
| Priority / Status / Role | Prioritas / Status / Role |
| Approve / Reject / Request Revision | Setujui / Tolak / Minta Revisi |
| Schedule Meeting / Complete / Cancel Meeting | Jadwalkan Meeting / Selesaikan / Batalkan Meeting |
| Activate / Deactivate | Aktifkan / Nonaktifkan |
| Submit (tandai selesai) | Submit |
| You do not have permission to perform this action. | Anda tidak punya izin untuk melakukan aksi ini. |
| X not found. | X tidak ditemukan. |
| X is required. | X wajib diisi. |
| Please choose a valid X. | Pilih X yang valid. |
| Please enter a valid X. | Masukkan X yang valid. |
| X updated successfully. | X berhasil diperbarui. |
| Something went wrong. Please try again. | Terjadi kesalahan. Silakan coba lagi. |
| No X yet. | Belum ada X. |

Sapaan: **Anda**. Hindari campuran "kamu"/"Anda" di satu tempat.

## Yang tidak diubah

- Log (`console.*`), komentar, nama variabel, nilai enum di database,
  `metadata` activity log, nama tab di URL.
- Kode task/meeting/project.
- Nilai `action` activity log yang tampil apa adanya di dropdown filter
  `/activity` (mis. `TASK CREATED`) dan sebagai cadangan di timeline untuk
  aksi yang belum punya kalimat: itu nilai enum database.
- Notifikasi lama yang sudah tersimpan di database (mis. "Task T-14 due today",
  dibuat sebelum penyeragaman bahasa). Kode yang menghasilkannya sudah
  berbahasa Indonesia; data produksi tidak ditulis ulang.
- Nama klien, project, dan judul yang diketik pengguna (mis. "Client Meeting"
  sebagai tipe meeting adalah istilah inti).
