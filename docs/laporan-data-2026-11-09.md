# Laporan konsistensi data produksi, 9 Nov 2026

Hanya-baca (SELECT lewat service role, tanpa perubahan data). Hanya jumlah dan kode project/task/meeting/usulan; tanpa nama, email, atau data pribadi. Tanggal acuan: 9 Nov 2026 (WIB). Skrip pembacaan tidak disimpan di repo.

## Ukuran data

| Tabel | Baris |
|---|---|
| profiles | 13 |
| projects | 5 |
| tasks (termasuk soft-deleted) | 12 |
| workstreams | 5 |
| project_managers | 7 |
| meetings | 1 |
| meeting_action_items | 1 |
| task_suggestions | 2 |
| notifications | 105 |

## Hasil pemeriksaan

| # | Pemeriksaan | Jumlah | Kode / ID |
|---|---|---|---|
| 1 | Task terbuka (bukan DONE/CANCELLED, tidak dihapus) dengan assignee non-ACTIVE | 0 | - |
| 2 | Project (bukan COMPLETED/CANCELLED) tanpa PM aktif (Admin/PM berstatus ACTIVE) | **1** | project `001` |
| 3 | Meeting bertanggal lewat yang masih DRAFT/SCHEDULED | 0 | - |
| 4 | Meeting COMPLETED tanpa notes | 0 | - |
| 5 | Action item menunjuk task terhapus/hilang | 0 | - |
| 6 | Usulan PENDING lebih dari 7 hari | 0 | - |
| 7 | Notifikasi belum dibaca lebih dari 30 hari | **35** | (hanya hitungan) |
| 8 | Orphan: project_managers tanpa project / tanpa profil | 0 / 0 | - |
| 9 | Orphan: workstreams tanpa project | 0 | - |
| 10 | Orphan: tasks tanpa project / tanpa workstream (yang diisi) / tanpa profil assignee | 0 / 0 / 0 | - |
| 11 | Profil tanpa user auth | 0 | - |
| 12 | User auth tanpa profil | 0 | - |

## Sorotan

- **Project `001`** berstatus ACTIVE, punya 4 task aktif, tetapi satu-satunya PM-nya berstatus INACTIVE. Akibatnya tidak ada PM aktif yang menerima notifikasi/usulan project ini dan hanya Admin yang bisa mengelolanya. Perlu keputusan pemilik: tambah PM baru lewat Project Settings, atau ubah status project. Tidak diubah di sini.
- **35 notifikasi** belum dibaca dan berumur lebih dari 30 hari. Sebaran per jenis: meeting 16 (undangan, pengingat, diperbarui, selesai), task 12, usulan 3, lain-lain 4 (digest harian, project ditugaskan). Tidak ada kebijakan pembersihan otomatis untuk tabel ini; pertimbangkan pembersihan berkala bila jumlahnya terus tumbuh.
- Semua pemeriksaan integritas lain (orphan, profil-auth, action item, meeting) bersih. Tidak ada sisa data uji `UJI-` terdeteksi dari pemeriksaan ini (jumlah project 5 dan profil 13 adalah data kerja).
